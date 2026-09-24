import type { z } from 'zod';
import { TokensResponseSchema, type TokensResponse } from '@chipperly/shared/schemas/auth';
import { apiBase } from './base';
import { getKv, setKv } from '../db/kv';
import { setServerDate } from '../clock';

const TOKENS_KEY = 'auth_tokens';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';
/** Same key/shape as lib/device/settings.ts's LockState; read directly (not the 'use client' hook) so this stays usable outside components. */
const LOCK_KEY = 'lock';
interface LockStateShape {
  locked_profile_id: string | null;
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  obtained_at: number;
}

/** Tokens live in kv so the app opens offline as signed_in (lib/auth/session.ts reads the same key). */
export async function getTokens(): Promise<StoredTokens | undefined> {
  return getKv<StoredTokens>(TOKENS_KEY);
}

export async function setTokens(tokens: TokensResponse | null): Promise<void> {
  if (tokens === null) {
    await setKv<StoredTokens | null>(TOKENS_KEY, null);
    return;
  }
  await setKv<StoredTokens>(TOKENS_KEY, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    obtained_at: Date.now(),
  });
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiOptions {
  /** Overrides the active account read from kv (CONTRACTS.md "X-Account-Id"). */
  accountId?: string;
  /** Sends `X-Locked: 1` (child-mode restricted writes). */
  locked?: boolean;
  signal?: AbortSignal;
  /** Validates the JSON body against this shared zod schema; a mismatch throws ApiError('bad_response') instead of handing back a shape the caller didn't ask for. */
  schema?: z.ZodType;
}

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

/**
 * Pure so it's unit-testable without a fetch mock (mirrors lib/sync/
 * applyPulledRow.ts's split for the same reason). `Content-Type` is set
 * only when there's a body: Fastify's JSON parser 400s an
 * `application/json` request with an empty body, which every no-body
 * api.post/patch/delete call (accept invite, resend/cancel invite, remove
 * member, delete account, ...) was sending.
 */
export function buildHeaders(params: {
  hasBody: boolean;
  accessToken?: string;
  accountId?: string;
  locked?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (params.hasBody) headers['Content-Type'] = 'application/json';
  if (params.accessToken) headers.Authorization = `Bearer ${params.accessToken}`;
  if (params.accountId) headers['X-Account-Id'] = params.accountId;
  if (params.locked) headers['X-Locked'] = '1';
  return headers;
}

// Parallel requests that 401 together (every sync pull after the 15-minute
// access token expires) used to each POST /auth/refresh with the same token;
// the server rotates it on the first, the rest failed and signed the user out.
let refreshInFlight: Promise<boolean> | null = null;

function refreshTokens(refreshToken: string): Promise<boolean> {
  refreshInFlight ??= doRefresh(refreshToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      // A request that read the old token after another refresh already rotated it.
      if ((await getTokens())?.refresh_token !== refreshToken) return true;
      await setTokens(null);
      return false;
    }
    const parsed = TokensResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      if (process.env.NODE_ENV === 'development') console.error('bad /auth/refresh response', parsed.error);
      await setTokens(null);
      return false;
    }
    await setTokens(parsed.data);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  opts: ApiOptions | undefined,
  isRetry: boolean,
): Promise<T> {
  const tokens = await getTokens();
  const accountId = opts?.accountId ?? (await getKv<string>(ACTIVE_ACCOUNT_KEY));
  const lockState = await getKv<LockStateShape>(LOCK_KEY);

  const headers = buildHeaders({
    hasBody: body !== undefined,
    accessToken: tokens?.access_token,
    accountId,
    locked: Boolean(opts?.locked || lockState?.locked_profile_id),
  });

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts?.signal,
  });

  const dateHeader = res.headers.get('date');
  if (dateHeader) setServerDate(dateHeader);

  // A 401 from /auth/login|register|refresh itself means bad credentials or
  // an expired refresh token, not an expired access token on an otherwise
  // valid session -- retrying it against the *currently cached* refresh
  // token (e.g. a caregiver re-authenticating from UnlockOverlay while a
  // child's session is active) has nothing to do with those credentials,
  // and if that unrelated refresh token happens to itself be invalid, the
  // retry's failure wipes the working session as a side effect of an
  // unrelated login attempt.
  if (res.status === 401 && !isRetry && tokens?.refresh_token && !path.startsWith('/auth/')) {
    const refreshed = await refreshTokens(tokens.refresh_token);
    if (refreshed) {
      return request<T>(method, path, body, opts, true);
    }
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as ErrorPayload | null;
    throw new ApiError(res.status, payload?.error?.code ?? 'unknown_error', payload?.error?.message);
  }

  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json();
  if (opts?.schema) {
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      if (process.env.NODE_ENV === 'development') console.error(`bad response from ${path}`, parsed.error);
      throw new ApiError(502, 'bad_response', parsed.error.issues[0]?.message);
    }
    return parsed.data as T;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions): Promise<T> => request<T>('GET', path, undefined, opts, false),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('POST', path, body, opts, false),
  put: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('PUT', path, body, opts, false),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('PATCH', path, body, opts, false),
  delete: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('DELETE', path, body, opts, false),
};

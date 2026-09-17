import type { TokensResponse } from '@chipperly/shared/schemas/auth';
import { apiBase } from './base';
import { getKv, setKv } from '../db/kv';
import { setServerDate } from '../clock';

const TOKENS_KEY = 'auth_tokens';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

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
}

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

async function refreshTokens(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await setTokens(null);
      return false;
    }
    const tokens = (await res.json()) as TokensResponse;
    await setTokens(tokens);
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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tokens?.access_token) headers.Authorization = `Bearer ${tokens.access_token}`;
  if (accountId) headers['X-Account-Id'] = accountId;
  if (opts?.locked) headers['X-Locked'] = '1';

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts?.signal,
  });

  const dateHeader = res.headers.get('date');
  if (dateHeader) setServerDate(dateHeader);

  if (res.status === 401 && !isRetry && tokens?.refresh_token) {
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
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions): Promise<T> => request<T>('GET', path, undefined, opts, false),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('POST', path, body, opts, false),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('PATCH', path, body, opts, false),
  delete: <T>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> =>
    request<T>('DELETE', path, body, opts, false),
};

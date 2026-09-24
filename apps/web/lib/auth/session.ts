'use client';

import { createElement, Fragment, useEffect, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import { MeResponseSchema, TokensResponseSchema, type MeAccount, type MeResponse, type TokensResponse } from '@chipperly/shared/schemas/auth';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { api, ApiError, getTokens, setTokens } from '../api/client';
import { getKv, setKv } from '../db/kv';
import { db } from '../db/db';
import { applySnapshotRow } from '../sync/applyPulledRow';
import { exitParentMode } from '../device/settings';

export type SessionStatus = 'loading' | 'signed_out' | 'signed_in';

export interface SessionState {
  status: SessionStatus;
  user: UserPublic | null;
  accounts: MeAccount[];
  profiles: Profile[];
}

const ME_KEY = 'me_cache';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';
const ACTIVE_PROFILE_KEY = 'active_profile_id';
const CURRENT_USER_KEY = 'current_user_id';

let state: SessionState = { status: 'loading', user: null, accounts: [], profiles: [] };
const listeners = new Set<() => void>();

function setState(patch: Partial<SessionState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SessionState {
  return state;
}

/** Live session state; tokens and `/me` are cached in kv, so this reads signed_in immediately offline. */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The signed-in user's id, for writes that need `created_by`/`updated_by`
 * and don't already have it passed in by the caller (lib/sync/mutate.ts,
 * lib/data/_util.ts and their callers).
 */
export async function getCurrentUserId(): Promise<string> {
  const id = await getKv<string>(CURRENT_USER_KEY);
  if (!id) throw new Error('session: no signed-in user');
  return id;
}

/** Who the synced rows on this device belong to; unlike current_user_id it survives sign-out. */
const DATA_OWNER_KEY = 'data_owner_user_id';
/** kv entries that describe the previous user's data; device-wide ones (device_id, device_settings, tokens) stay. */
const PER_USER_KV_KEYS = [
  ACTIVE_ACCOUNT_KEY,
  ACTIVE_PROFILE_KEY,
  'device_role',
  'lock',
  'pending_reward_requests',
  'verify_banner_dismissed',
  'reward_alerts_banner_dismissed',
  'timer_state',
];

/**
 * Sign-out keeps local data so the same person signing back in (or offline)
 * loses nothing, including unsent edits. A different person signing in must
 * not inherit it: their account and profiles never showed up until the site
 * data was cleared by hand, because the old active ids and rows won.
 */
async function resetLocalDataIfNewUser(me: MeResponse): Promise<void> {
  const owner = await getKv<string>(DATA_OWNER_KEY);
  // Devices from before this key existed: an active account the user isn't in means someone else's data.
  const activeAccount = owner ? null : await getKv<string>(ACTIVE_ACCOUNT_KEY);
  const foreign = owner
    ? owner !== me.user.id
    : activeAccount != null && !me.accounts.some((a) => a.account.id === activeAccount);
  if (foreign) {
    await db.transaction('rw', db.tables, async () => {
      // By name: inside a transaction db.tables can hand back different Table objects than db.kv,
      // and clearing kv would take the just-issued tokens with it.
      await Promise.all(db.tables.filter((table) => table.name !== 'kv').map((table) => table.clear()));
      await db.kv.bulkDelete(PER_USER_KV_KEYS);
    });
  }
  await setKv(DATA_OWNER_KEY, me.user.id);
}

async function applyMe(me: MeResponse): Promise<void> {
  await resetLocalDataIfNewUser(me);
  await setKv<MeResponse>(ME_KEY, me);
  await setKv<string>(CURRENT_USER_KEY, me.user.id);
  if (me.profiles.length > 0) {
    // Not a bare bulkPut: `/me` is fetched on every boot and its response can
    // land after a local profile edit that is already written (and pushed),
    // which would roll that edit back — a day goal, a rename, any setting.
    await db.transaction('rw', db.profiles, async () => {
      const locals = await db.profiles.bulkGet(me.profiles.map((profile) => profile.id));
      await db.profiles.bulkPut(me.profiles.map((incoming, i) => applySnapshotRow(locals[i], incoming)));
    });
  }
  if (me.accounts.length > 0) await db.accounts.bulkPut(me.accounts.map((a) => a.account));
  await db.users.put(me.user);

  const activeAccount = await getKv<string>(ACTIVE_ACCOUNT_KEY);
  if (!activeAccount && me.accounts[0]) await setKv(ACTIVE_ACCOUNT_KEY, me.accounts[0].account.id);

  const activeProfile = await getKv<string>(ACTIVE_PROFILE_KEY);
  if (!activeProfile && me.profiles[0]) await setKv(ACTIVE_PROFILE_KEY, me.profiles[0].id);

  setState({ status: 'signed_in', user: me.user, accounts: me.accounts, profiles: me.profiles });
}

/** Also called by lib/sync/engine.ts on an unrecoverable 401: session is invalid, drop back to signed-out. */
export async function clearSession(): Promise<void> {
  await setTokens(null);
  await setKv<MeResponse | null>(ME_KEY, null);
  await setKv<string | null>(CURRENT_USER_KEY, null);
  setState({ status: 'signed_out', user: null, accounts: [], profiles: [] });
}

/** Re-fetches `/me` and re-caches it; the offline-first source is kv + Dexie, this refreshes both. */
export async function refreshMe(): Promise<void> {
  const me = await api.get<MeResponse>('/me', { schema: MeResponseSchema });
  await applyMe(me);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const tokens = await api.post<TokensResponse>('/auth/login', { email, password }, { schema: TokensResponseSchema });
  await setTokens(tokens);
  await refreshMe();
}

/** `invite` carries the closed-beta gate (see docs/CONTRACTS.md): a code the owner hands out, or a
 * pending account invite's token, which bypasses the code entirely (components/auth/postAuthRedirect.ts).
 * `consented_at` (S2's required checkbox, ms) is sent with every register (SOW Q21 / COPPA). */
export async function signUp(
  email: string,
  password: string,
  display_name: string,
  consented_at: number,
  invite?: { invite_code?: string; invite_token?: string },
): Promise<void> {
  const tokens = await api.post<TokensResponse>(
    '/auth/register',
    {
      email,
      password,
      display_name,
      consented_at,
      invite_code: invite?.invite_code,
      invite_token: invite?.invite_token,
    },
    { schema: TokensResponseSchema },
  );
  await setTokens(tokens);
  await refreshMe();
}

/** `consented_at`: only required when this sign-in creates a new user; the API 409s consent_required without it then. */
export async function signInWithGoogle(
  idToken: string,
  invite?: { invite_code?: string; invite_token?: string; consented_at?: number },
): Promise<void> {
  const tokens = await api.post<TokensResponse>(
    '/auth/google',
    {
      id_token: idToken,
      invite_code: invite?.invite_code,
      invite_token: invite?.invite_token,
      consented_at: invite?.consented_at,
    },
    { schema: TokensResponseSchema },
  );
  await setTokens(tokens);
  await refreshMe();
}

export async function signOut(): Promise<void> {
  await clearSession();
}

/** Wire body is the plain pin (schemas/auth.ts PinBodySchema); the server hashes and stores it. */
export async function setPin(pin: string): Promise<void> {
  await api.patch('/me/pin', { pin });
  await refreshMe();
}

async function bootstrap(): Promise<void> {
  // Every fresh app start defaults back to the child view (lib/device/settings.ts's
  // useParentMode doc): a caregiver who unlocked into Today yesterday shouldn't find
  // the app still sitting there, unlocked, next time anyone opens it.
  await exitParentMode();

  const tokens = await getTokens();
  const cachedMe = await getKv<MeResponse>(ME_KEY);

  if (tokens?.access_token && cachedMe) {
    setState({ status: 'signed_in', user: cachedMe.user, accounts: cachedMe.accounts, profiles: cachedMe.profiles });
  } else {
    setState({ status: 'signed_out', user: null, accounts: [], profiles: [] });
  }

  if (!tokens?.access_token) return;
  try {
    await refreshMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) await clearSession();
    // Any other error (offline, 5xx): keep the cached signed_in state.
  }
}

// Plain .ts (not .tsx, per CONTRACTS.md's fixed file name) so no JSX syntax;
// createElement stands in for `<>{children}</>`.
export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  useEffect(() => {
    void bootstrap();
  }, []);
  return createElement(Fragment, null, children);
}

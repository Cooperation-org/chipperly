'use client';

import { createElement, Fragment, useEffect, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import type { MeAccount, MeResponse, TokensResponse } from '@chipperly/shared/schemas/auth';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { api, ApiError, getTokens, setTokens } from '../api/client';
import { getKv, setKv } from '../db/kv';
import { db } from '../db/db';

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

async function applyMe(me: MeResponse): Promise<void> {
  await setKv<MeResponse>(ME_KEY, me);
  await setKv<string>(CURRENT_USER_KEY, me.user.id);
  if (me.profiles.length > 0) await db.profiles.bulkPut(me.profiles);
  if (me.accounts.length > 0) await db.accounts.bulkPut(me.accounts.map((a) => a.account));
  await db.users.put(me.user);

  const activeAccount = await getKv<string>(ACTIVE_ACCOUNT_KEY);
  if (!activeAccount && me.accounts[0]) await setKv(ACTIVE_ACCOUNT_KEY, me.accounts[0].account.id);

  const activeProfile = await getKv<string>(ACTIVE_PROFILE_KEY);
  if (!activeProfile && me.profiles[0]) await setKv(ACTIVE_PROFILE_KEY, me.profiles[0].id);

  setState({ status: 'signed_in', user: me.user, accounts: me.accounts, profiles: me.profiles });
}

async function clearSession(): Promise<void> {
  await setTokens(null);
  await setKv<MeResponse | null>(ME_KEY, null);
  await setKv<string | null>(CURRENT_USER_KEY, null);
  setState({ status: 'signed_out', user: null, accounts: [], profiles: [] });
}

/** Re-fetches `/me` and re-caches it; the offline-first source is kv + Dexie, this refreshes both. */
export async function refreshMe(): Promise<void> {
  const me = await api.get<MeResponse>('/me');
  await applyMe(me);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const tokens = await api.post<TokensResponse>('/auth/login', { email, password });
  await setTokens(tokens);
  await refreshMe();
}

export async function signUp(email: string, password: string, display_name: string): Promise<void> {
  const tokens = await api.post<TokensResponse>('/auth/register', { email, password, display_name });
  await setTokens(tokens);
  await refreshMe();
}

export async function signInWithGoogle(idToken: string): Promise<void> {
  const tokens = await api.post<TokensResponse>('/auth/google', { id_token: idToken });
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

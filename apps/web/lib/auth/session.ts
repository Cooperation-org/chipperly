'use client';

import { createElement, Fragment, useEffect, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { defaultAnswers } from '@chipperly/shared/constants/setup';
import type { Account, UserPublic } from '@chipperly/shared/schemas/account';
import { MeResponseSchema, TokensResponseSchema, type MeAccount, type MeResponse, type TokensResponse } from '@chipperly/shared/schemas/auth';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { api, ApiError, getTokens, setTokens } from '../api/client';
import { getKv, setKv } from '../db/kv';
import { db } from '../db/db';
import { applySnapshotRow } from '../sync/applyPulledRow';
import { enterParentMode, exitParentMode } from '../device/settings';
import { newId } from '../ids';
import { seedProfileLocally } from '../profile/seedLocal';
import { GUEST_IDS_KEY, GUEST_STARTED_AT_KEY, isGuestMode, setGuestMode, wipeLocalData, type GuestIds } from './guest';
import { isGuestExpired } from './guestExpiry';
import { CARRY_NOTICE_KEY, CARRY_OVER_KEY, GUEST_KV_KEYS, runCarryOver, setCarryOverPhase } from './carryOver';
import { canCarryOver, type CarryOver } from './rekeyGuestWork';

export type SessionStatus = 'loading' | 'signed_out' | 'signed_in';

export interface SessionState {
  status: SessionStatus;
  user: UserPublic | null;
  accounts: MeAccount[];
  profiles: Profile[];
  /** A local-only trial: same 'signed_in' status for the route guards, but no tokens and nothing leaves the device. */
  guest: boolean;
}

const ME_KEY = 'me_cache';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';
const ACTIVE_PROFILE_KEY = 'active_profile_id';
const CURRENT_USER_KEY = 'current_user_id';

let state: SessionState = { status: 'loading', user: null, accounts: [], profiles: [], guest: false };
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
async function resetLocalDataIfNewUser(me: MeResponse, keepGuest: boolean, droppedTrial: boolean): Promise<void> {
  const owner = await getKv<string>(DATA_OWNER_KEY);
  const wasGuest = (await getKv<number>(GUEST_STARTED_AT_KEY)) !== undefined;
  // Devices from before this key existed: an active account the user isn't in means someone else's data.
  const activeAccount = owner ? null : await getKv<string>(ACTIVE_ACCOUNT_KEY);
  // A guest's sample data belongs to nobody who can sign in, unless "Save my work" is moving it into this new account.
  const foreign =
    !keepGuest &&
    (wasGuest || (owner ? owner !== me.user.id : activeAccount != null && !me.accounts.some((a) => a.account.id === activeAccount)));
  if (foreign) {
    await clearLocalUserData();
    // Said once, so signing in to an existing account instead of creating one doesn't look like the trial vanished by accident.
    if (droppedTrial) await setKv(CARRY_NOTICE_KEY, 'discarded');
  }
  setGuestMode(false);
  await setKv(DATA_OWNER_KEY, me.user.id);
}

/** Every table but kv, and the kv entries that describe the previous user or a guest. */
async function clearLocalUserData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    // By name: inside a transaction db.tables can hand back different Table objects than db.kv,
    // and clearing kv would take the just-issued tokens with it.
    await Promise.all(db.tables.filter((table) => table.name !== 'kv').map((table) => table.clear()));
    await db.kv.bulkDelete([...PER_USER_KV_KEYS, ...GUEST_KV_KEYS]);
  });
}

async function applyMe(me: MeResponse): Promise<void> {
  const flag = await getKv<CarryOver>(CARRY_OVER_KEY);
  const carrying = flag !== undefined && canCarryOver(flag, me);
  await resetLocalDataIfNewUser(me, carrying, flag !== undefined && !carrying);
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

  setState({ status: 'signed_in', user: me.user, accounts: me.accounts, profiles: me.profiles, guest: false });

  if (!carrying) {
    setCarryOverPhase('idle');
  } else if (await runCarryOver(me)) {
    // Picks up the account and profile the move just made (the flag is gone, so this doesn't come back here).
    await refreshMe();
  }
}

/** Also called by lib/sync/engine.ts on an unrecoverable 401: session is invalid, drop back to signed-out. */
export async function clearSession(): Promise<void> {
  await setTokens(null);
  await setKv<MeResponse | null>(ME_KEY, null);
  await setKv<string | null>(CURRENT_USER_KEY, null);
  setState({ status: 'signed_out', user: null, accounts: [], profiles: [], guest: false });
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

/** The guest's user/account/profile, read back from Dexie where startGuestSession put them. */
async function loadGuest(): Promise<void> {
  const ids = await getKv<GuestIds>(GUEST_IDS_KEY);
  const user = ids ? await db.users.get(ids.user_id) : undefined;
  const account = ids ? await db.accounts.get(ids.account_id) : undefined;
  const profile = ids ? await db.profiles.get(ids.profile_id) : undefined;
  if (!user || !account || !profile) {
    await endGuestSession();
    return;
  }
  setGuestMode(true);
  setState({ status: 'signed_in', user, accounts: [{ account, role: 'admin' }], profiles: [profile], guest: true });
}

/** True when this device holds a guest session (started or, if it ran out, just erased). */
async function bootstrapGuest(): Promise<boolean> {
  const startedAt = await getKv<number>(GUEST_STARTED_AT_KEY);
  if (startedAt === undefined) return false;
  if (isGuestExpired(startedAt, Date.now())) await endGuestSession();
  else await loadGuest();
  return true;
}

/**
 * Makes this device a guest: erases whatever is here, then writes a synthetic user, one account and
 * a sample child, all in Dexie. No tokens and no request; lib/api/client.ts refuses while guestMode is on.
 */
export async function startGuestSession(): Promise<void> {
  await wipeLocalData();
  const now = Date.now();
  const ids: GuestIds = { user_id: newId(), account_id: newId(), profile_id: newId() };
  const setup = defaultAnswers('8-12');
  const user: UserPublic = {
    id: ids.user_id,
    email: 'guest@chipperly.invalid',
    display_name: 'Guest',
    pin_hash: null,
    // Marked verified so the verify-your-email banner stays away.
    email_verified_at: now,
    created_at: now,
    auth_provider: null,
  };
  const account: Account = { id: ids.account_id, kind: 'household', name: 'Guest', created_at: now };
  const profile: Profile = {
    id: ids.profile_id,
    account_id: ids.account_id,
    name: 'Sample person',
    avatar_emoji: '🧒',
    avatar_photo_id: null,
    share_token: null,
    first_then_activity_id: null,
    first_then_reward_id: null,
    settings: { age_band: setup.age_band, setup },
    version: 0,
    client_updated_at: now,
    updated_by: ids.user_id,
    deleted_at: null,
  };
  await db.users.put(user);
  await db.accounts.put(account);
  await db.profiles.put(profile);
  await seedProfileLocally(profile.id, user.id, setup);
  await setKv(GUEST_IDS_KEY, ids);
  await setKv(CURRENT_USER_KEY, user.id);
  await setKv(ACTIVE_ACCOUNT_KEY, account.id);
  await setKv(ACTIVE_PROFILE_KEY, profile.id);
  await setKv('device_role', { kind: 'caregiver' });
  await enterParentMode();
  await setKv(GUEST_STARTED_AT_KEY, now);
  setGuestMode(true);
  setState({ status: 'signed_in', user, accounts: [{ account, role: 'admin' }], profiles: [profile], guest: true });
}

/** Erases the guest's data and drops back to signed-out (expiry, or "Create account" from the banner). */
export async function endGuestSession(): Promise<void> {
  setGuestMode(false);
  await wipeLocalData();
  setState({ status: 'signed_out', user: null, accounts: [], profiles: [], guest: false });
}

/**
 * "Create account" / "Save my work": leaves guest mode but keeps the guest's data, with a flag naming it.
 * Sign-up then moves it into the new account (lib/auth/carryOver.ts). Until then the data just sits in
 * Dexie: a reload goes back to being a guest (bootstrap), and the 48 hours still run.
 */
export async function startSaveWork(): Promise<void> {
  const ids = await getKv<GuestIds>(GUEST_IDS_KEY);
  if (!ids) {
    await endGuestSession();
    return;
  }
  await setKv<CarryOver>(CARRY_OVER_KEY, { guest: ids });
  setGuestMode(false);
  setState({ status: 'signed_out', user: null, accounts: [], profiles: [], guest: false });
}

/** "Try again" on the saving screen: the same `/me` fetch that starts the move, so it resumes wherever it stopped. */
export async function retryCarryOver(): Promise<void> {
  setCarryOverPhase('saving');
  try {
    await refreshMe();
  } catch {
    setCarryOverPhase('failed');
  }
}

/** "Start without it" on the saving screen: gives up on the trial's work and carries on with an empty new account. */
export async function skipCarryOver(): Promise<void> {
  await clearLocalUserData();
  setCarryOverPhase('idle');
  await refreshMe().catch(() => undefined);
}

/** Run on a timer and when the tab becomes visible again: a guest left open past 48 hours is erased. */
export async function expireGuestIfDue(): Promise<void> {
  if (!isGuestMode()) return;
  const startedAt = await getKv<number>(GUEST_STARTED_AT_KEY);
  if (startedAt === undefined || isGuestExpired(startedAt, Date.now())) await endGuestSession();
}

async function bootstrap(): Promise<void> {
  // Every fresh app start defaults back to the child view (lib/device/settings.ts's
  // useParentMode doc): a caregiver who unlocked into Today yesterday shouldn't find
  // the app still sitting there, unlocked, next time anyone opens it.
  await exitParentMode();

  const tokens = await getTokens();
  const signedIn = Boolean(tokens?.access_token);
  const carryFlag = await getKv<CarryOver>(CARRY_OVER_KEY);
  // Signed in with a move still pending (closed mid-way, or it failed): finish it, even past the 48 hours.
  if (carryFlag && signedIn) setCarryOverPhase('saving');
  else {
    // The visitor never signed up: back to being a guest, so the flag is spent.
    if (carryFlag) await db.kv.delete(CARRY_OVER_KEY);
    if (await bootstrapGuest()) return;
  }

  const cachedMe = await getKv<MeResponse>(ME_KEY);

  if (tokens?.access_token && cachedMe) {
    setState({ status: 'signed_in', user: cachedMe.user, accounts: cachedMe.accounts, profiles: cachedMe.profiles, guest: false });
  } else {
    setState({ status: 'signed_out', user: null, accounts: [], profiles: [], guest: false });
  }

  if (!tokens?.access_token) return;
  try {
    await refreshMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await clearSession();
      setCarryOverPhase('idle');
    } else if (carryFlag) setCarryOverPhase('failed');
    // Any other error (offline, 5xx): keep the cached signed_in state.
  }
}

// Plain .ts (not .tsx, per CONTRACTS.md's fixed file name) so no JSX syntax;
// createElement stands in for `<>{children}</>`.
export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  useEffect(() => {
    void bootstrap();
    const check = (): void => void expireGuestIfDue();
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return createElement(Fragment, null, children);
}

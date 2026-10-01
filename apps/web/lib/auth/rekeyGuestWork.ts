import { SYNCED_TABLES } from '@chipperly/shared/schemas/sync';
import type { SyncedTable } from '@chipperly/shared/constants/tables';
import type { Profile } from '@chipperly/shared/schemas/profile';
import type { SyncedRow } from '../db/db';

/** Every row of a guest's profile, by table. */
export type GuestRows = { [T in SyncedTable]?: SyncedRow<T>[] };

export interface RekeyTarget {
  /** The profile the server just made for the new account (POST /accounts/:id/profiles). */
  serverProfile: Profile;
  userId: string;
  now: number;
}

/**
 * Pure: the guest's rows, ready to be queued for the new profile. Row ids stay as they are, so every
 * reference between rows (activity_id, story_id, location_id, ref_id, the profile's First-Then ids)
 * stays valid and a retried push lands on the same rows instead of duplicating them. What changes is
 * ownership: profile_id and updated_by. The profile keeps the server's id, account and version, and
 * takes the guest's name, picture and settings; its client_updated_at is moved past the server copy's
 * so the push is not refused as stale. Tables come back in dependency order (parents first).
 */
export function rekeyGuestWork(
  guestProfile: Profile,
  rows: GuestRows,
  target: RekeyTarget,
): { profile: Profile; rows: { table: SyncedTable; row: SyncedRow<SyncedTable> }[] } {
  const { serverProfile, userId, now } = target;
  const profile: Profile = {
    ...serverProfile,
    name: guestProfile.name,
    avatar_emoji: guestProfile.avatar_emoji,
    avatar_photo_id: guestProfile.avatar_photo_id,
    first_then_activity_id: guestProfile.first_then_activity_id,
    first_then_reward_id: guestProfile.first_then_reward_id,
    settings: guestProfile.settings,
    client_updated_at: Math.max(now, serverProfile.client_updated_at + 1),
    updated_by: userId,
  };
  const out: { table: SyncedTable; row: SyncedRow<SyncedTable> }[] = [];
  for (const table of SYNCED_TABLES) {
    for (const row of rows[table] ?? []) {
      out.push({ table, row: { ...row, profile_id: profile.id, updated_by: userId } as SyncedRow<SyncedTable> });
    }
  }
  return { profile, rows: out };
}

/** What a "Save my work" press leaves in kv: the guest's ids, plus the account once the server has made it (so a retry reuses it). */
export interface CarryOver {
  guest: { user_id: string; account_id: string; profile_id: string };
  account_id?: string;
}

/**
 * Pure: whether the guest's work may move into this signed-in user's account. Only a brand-new user
 * (no profile yet, at most the account an earlier attempt made) gets it; signing in to an account that
 * already has people in it would mix a throwaway trial into real data, so that trial is dropped instead.
 */
export function canCarryOver(carry: CarryOver, me: { accounts: { account: { id: string } }[]; profiles: unknown[] }): boolean {
  if (carry.account_id) return me.accounts.some((a) => a.account.id === carry.account_id);
  return me.profiles.length === 0 && me.accounts.length <= 1;
}

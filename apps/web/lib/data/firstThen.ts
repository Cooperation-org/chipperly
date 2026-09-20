'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity } from '@chipperly/shared/schemas/activity';
import type { Reward } from '@chipperly/shared/schemas/reward';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert } from '../sync/mutate';
import { getCurrentUserId } from './_util';
import { getActiveLocationId } from './locations';

export interface FirstThen {
  first: Activity | undefined;
  then: Reward | undefined;
}

export function useFirstThen(profileId: string): FirstThen {
  const profile = useLiveQuery(() => db.profiles.get(profileId), [profileId]);
  const first = useLiveQuery(
    () => (profile?.first_then_activity_id ? db.activities.get(profile.first_then_activity_id) : undefined),
    [profile?.first_then_activity_id],
  );
  const then = useLiveQuery(
    () => (profile?.first_then_reward_id ? db.rewards.get(profile.first_then_reward_id) : undefined),
    [profile?.first_then_reward_id],
  );
  return { first, then };
}

/** `first_then_*` live on the profile row (CONTRACTS.md); pushed as an upsert on table 'profiles'. */
async function patchProfile(
  profileId: string,
  patch: Partial<Pick<Profile, 'first_then_activity_id' | 'first_then_reward_id'>>,
): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (!profile) return;
  const updated_by = await getCurrentUserId();
  await upsert('profiles', { ...profile, ...patch, client_updated_at: now(), updated_by });
}

export async function setFirst(profileId: string, activityId: string | null): Promise<void> {
  await patchProfile(profileId, { first_then_activity_id: activityId });
}

export async function setThen(profileId: string, rewardId: string | null): Promise<void> {
  await patchProfile(profileId, { first_then_reward_id: rewardId });
}

export async function clear(profileId: string): Promise<void> {
  await patchProfile(profileId, { first_then_activity_id: null, first_then_reward_id: null });
}

/** Marks FIRST done. Awards a chip through the ledger when the activity earns one; returns whether it did. */
export async function completeFirst(profileId: string, userId: string): Promise<boolean> {
  const profile = await db.profiles.get(profileId);
  if (!profile?.first_then_activity_id) return false;
  const activity = await db.activities.get(profile.first_then_activity_id);
  if (!activity || activity.chip_value <= 0) return false;

  const locationId = activity.location_id ?? (await getActiveLocationId(profileId));
  await upsert('chip_ledger', {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: userId,
    deleted_at: null,
    location_id: locationId,
    delta: activity.chip_value,
    reason: 'task',
    ref_id: activity.id,
    created_at: now(),
    created_by: userId,
  });
  return true;
}

/**
 * Undoes `completeFirst`'s award. Matches lib/data/schedule.ts's own undo:
 * never remove the original ledger row, append a compensating one that nets
 * this activity's contribution back to zero.
 */
export async function uncompleteFirst(profileId: string, userId: string): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (!profile?.first_then_activity_id) return;
  const activityId = profile.first_then_activity_id;

  const rows = (await db.chip_ledger.where('profile_id').equals(profileId).toArray()).filter(
    (row) => row.ref_id === activityId && row.deleted_at === null,
  );
  const net = rows.reduce((sum, row) => sum + row.delta, 0);
  if (net === 0) return;

  const activity = await db.activities.get(activityId);
  const locationId = activity?.location_id ?? (await getActiveLocationId(profileId));
  await upsert('chip_ledger', {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: userId,
    deleted_at: null,
    location_id: locationId,
    delta: -net,
    reason: 'adjust',
    ref_id: activityId,
    created_at: now(),
    created_by: userId,
  });
}

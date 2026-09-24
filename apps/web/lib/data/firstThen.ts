'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity } from '@chipperly/shared/schemas/activity';
import type { Reward } from '@chipperly/shared/schemas/reward';
import type { FirstThenProgress, Profile } from '@chipperly/shared/schemas/profile';
import { todayIso } from '@chipperly/shared/helpers/date';
import { db } from '../db/db';
import { getKv, setKv } from '../db/kv';
import { api, ApiError } from '../api/client';
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
  patch: Partial<Pick<Profile, 'first_then_activity_id' | 'first_then_reward_id' | 'settings'>>,
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

/** Caregiver-only: minutes of timer when the child asks for the reward, or null for none. */
export async function setFirstThenTimer(profileId: string, minutes: number | null): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (!profile) return;
  await patchProfile(profileId, { settings: { ...profile.settings, first_then_timer_minutes: minutes } });
}

const PENDING_KEY = 'pending_first_then';

/** POSTs today's progress; false when it should be retried (offline, server down). */
async function sendProgress(profileId: string, progress: FirstThenProgress | null): Promise<boolean> {
  try {
    await api.post(`/profiles/${profileId}/first-then`, { progress });
    return true;
  } catch (err) {
    return err instanceof ApiError && err.status >= 400 && err.status < 500;
  }
}

/**
 * Records FIRST done / THEN asked for, for every device of this family. The
 * server writes it (a locked child device can't push the profile row) and it
 * syncs back down; the local profile row is updated at once so this screen
 * doesn't wait for that. Offline, the latest state waits in kv for
 * flushFirstThenProgress after the next sync.
 */
async function saveProgress(profileId: string, progress: FirstThenProgress | null): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (profile) {
    await db.profiles.put({ ...profile, settings: { ...profile.settings, first_then_progress: progress }, client_updated_at: now() });
  }
  const pending = (await getKv<Record<string, FirstThenProgress | null>>(PENDING_KEY)) ?? {};
  if (await sendProgress(profileId, progress)) {
    if (profileId in pending) {
      delete pending[profileId];
      await setKv(PENDING_KEY, pending);
    }
    return;
  }
  await setKv(PENDING_KEY, { ...pending, [profileId]: progress });
}

/** Sends First-Then progress saved while offline; called after each sync cycle (lib/sync/engine.ts). */
export async function flushFirstThenProgress(): Promise<void> {
  const pending = (await getKv<Record<string, FirstThenProgress | null>>(PENDING_KEY)) ?? {};
  const left: Record<string, FirstThenProgress | null> = {};
  for (const [profileId, progress] of Object.entries(pending)) {
    if (!(await sendProgress(profileId, progress))) left[profileId] = progress;
  }
  if (Object.keys(pending).length > 0) await setKv(PENDING_KEY, left);
}

/**
 * Whether FIRST is checked and THEN asked for, read from the synced profile so
 * the child's tablet and the parent's phone agree. Only today's entry for this
 * exact First/Then pair counts: a new day or a new pair starts unchecked.
 */
export function useFirstThenProgress(
  profileId: string,
  firstId: string | undefined,
  thenId: string | undefined,
): { done: boolean; asked: boolean; set: (next: { done: boolean; asked?: boolean }) => Promise<void> } {
  const stored = useLiveQuery(() => db.profiles.get(profileId), [profileId])?.settings.first_then_progress ?? null;
  const current =
    stored && firstId && thenId && stored.date === todayIso() && stored.first_id === firstId && stored.then_id === thenId
      ? stored
      : null;
  return {
    done: current !== null,
    asked: current?.asked ?? false,
    set: ({ done, asked = false }) =>
      saveProgress(
        profileId,
        done && firstId && thenId ? { date: todayIso(), first_id: firstId, then_id: thenId, asked } : null,
      ),
  };
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

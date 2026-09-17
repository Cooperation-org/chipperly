'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ChipLedger, ChipReason } from '@chipperly/shared/schemas/chips';
import type { Location } from '@chipperly/shared/schemas/location';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { balanceFor } from '@chipperly/shared/helpers/chips';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert } from '../sync/mutate';
import { getCurrentUserId } from './_util';

// perf-2 (chip_ledger half): the [profile_id+location_id] compound index
// can't serve this. IndexedDB drops a record from a compound index entirely
// when any key-path component is null, and location_id is null for every
// shared-pool row (getActiveLocationId() returns null before a family has
// created its first location), confirmed against real IndexedDB: even
// querying the index with a null component throws DataError. Scoping
// to the index would silently drop shared-pool chips from every balance.
// See openIssues.
export function useBalance(profileId: string, locationId: string | null): number {
  const ledger = useLiveQuery(() => db.chip_ledger.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => balanceFor(ledger, locationId), [ledger, locationId]);
}

export async function addChip(
  profileId: string,
  locationId: string | null,
  reason: ChipReason,
  refId: string | null = null,
  delta = 1,
): Promise<void> {
  const created_by = await getCurrentUserId();
  const row: ChipLedger = {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: created_by,
    deleted_at: null,
    location_id: locationId,
    delta,
    reason,
    ref_id: refId,
    created_at: now(),
    created_by,
  };
  await upsert('chip_ledger', row);
}

/** Appends the redeem entry and clears the location's working-for reward. */
export async function redeem(profileId: string, locationId: string | null, reward: Reward): Promise<void> {
  const cost = reward.chip_cost ?? 0;
  await addChip(profileId, locationId, 'redeem', reward.id, -cost);

  if (!locationId) return;
  const location = await db.locations.get(locationId);
  if (!location) return;
  await upsert('locations', { ...location, working_for_reward_id: null });
}

export function useLedger(profileId: string, locationId?: string | null): ChipLedger[] {
  const rows = useLiveQuery(() => db.chip_ledger.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        row.deleted_at === null &&
        (locationId === undefined || row.location_id === locationId || row.location_id === null),
    );
    return filtered.slice().sort((a, b) => b.created_at - a.created_at);
  }, [rows, locationId]);
}

export interface WorkingFor {
  reward: Reward | null;
  goal: number;
  filled: number;
}

/** Pure: goal is the reward's cost, falling back to the location's manual goal; filled never exceeds it. */
export function computeWorkingFor(
  balance: number,
  location: Pick<Location, 'chip_goal'> | undefined,
  reward: Reward | null,
): WorkingFor {
  const goal = reward?.chip_cost ?? location?.chip_goal ?? 0;
  const filled = Math.min(balance, goal);
  return { reward, goal, filled };
}

export function useWorkingFor(profileId: string, locationId: string | null): WorkingFor {
  const balance = useBalance(profileId, locationId);
  const location = useLiveQuery(() => (locationId ? db.locations.get(locationId) : undefined), [locationId]);
  const rewardId = location?.working_for_reward_id ?? null;
  const reward = useLiveQuery(() => (rewardId ? db.rewards.get(rewardId) : undefined), [rewardId]);
  return useMemo(() => computeWorkingFor(balance, location, reward ?? null), [balance, location, reward]);
}

export async function setWorkingFor(locationId: string, rewardId: string | null): Promise<void> {
  const location = await db.locations.get(locationId);
  if (!location) return;
  await upsert('locations', { ...location, working_for_reward_id: rewardId });
}

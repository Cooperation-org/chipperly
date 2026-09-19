'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ChipLedger, ChipReason } from '@chipperly/shared/schemas/chips';
import type { Location } from '@chipperly/shared/schemas/location';
import type { RedeemMode } from '@chipperly/shared/schemas/profile';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { balanceFor } from '@chipperly/shared/helpers/chips';
import { todayIso } from '@chipperly/shared/helpers/date';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert } from '../sync/mutate';
import { getCurrentUserId } from './_util';
import { getMoodLevel } from './mood';

export type ChipTone = 'positive' | 'neutral' | 'negative';

/** Pure: attitude-bonus idea, first slice. Positive >= 1, negative <= -1, everything else (incl. no mood event) is neutral or unknown. */
export function chipTone(level: number | null): ChipTone | null {
  if (level === null) return null;
  if (level >= 1) return 'positive';
  if (level <= -1) return 'negative';
  return 'neutral';
}

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
  const mood_level = await getMoodLevel(profileId, todayIso());
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
    mood_level,
  };
  await upsert('chip_ledger', row);
}

/** Pure: SOW Q1, decided. 'reset' takes the whole balance so the board empties to zero; 'subtract' just removes the cost. */
export function computeRedeemDelta(mode: RedeemMode, cost: number, balance: number): number {
  return mode === 'reset' ? -balance : -cost;
}

/** Appends the redeem entry and clears the location's working-for reward. Returns the amount removed (for undo). */
export async function redeem(profileId: string, locationId: string | null, reward: Reward): Promise<number> {
  const cost = reward.chip_cost ?? 0;
  const profile = await db.profiles.get(profileId);
  const mode: RedeemMode = profile?.settings.redeem_mode ?? 'subtract';
  const ledger = await db.chip_ledger.where('profile_id').equals(profileId).toArray();
  const balance = balanceFor(ledger, locationId);
  const delta = computeRedeemDelta(mode, cost, balance);
  await addChip(profileId, locationId, 'redeem', reward.id, delta);

  if (locationId) {
    const location = await db.locations.get(locationId);
    if (location) await upsert('locations', { ...location, working_for_reward_id: null });
  }
  return -delta;
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

/**
 * Pure: tones for the `filled` chips currently on the board, oldest first.
 * Replays the ledger like a stack (same location scoping as `balanceFor`)
 * so a later redeem/adjust removes the most recently earned chip's tone
 * first, same as the board visually pops the newest chip.
 */
export function chipTones(
  ledger: readonly Pick<ChipLedger, 'location_id' | 'delta' | 'deleted_at' | 'created_at' | 'mood_level'>[],
  locationId: string | null,
  filled: number,
): Array<ChipTone | null> {
  const ordered = ledger
    .filter((row) => row.deleted_at === null && (row.location_id === locationId || row.location_id === null))
    .slice()
    .sort((a, b) => a.created_at - b.created_at);

  const units: Array<ChipTone | null> = [];
  for (const row of ordered) {
    if (row.delta > 0) {
      for (let i = 0; i < row.delta; i++) units.push(chipTone(row.mood_level ?? null));
    } else if (row.delta < 0) {
      units.length = Math.max(0, units.length + row.delta);
    }
  }
  return units.slice(-filled);
}

/**
 * Pure: total chips earned (positive-delta entries only, so a redeem or a
 * manual subtract never counts as "earned") across every location, on the
 * given local day. Chips tab "by day" view.
 */
export function chipsEarnedOn(
  rows: readonly Pick<ChipLedger, 'delta' | 'deleted_at' | 'created_at'>[],
  isoDate: string,
): number {
  return rows
    .filter((row) => row.deleted_at === null && row.delta > 0 && todayIso(new Date(row.created_at)) === isoDate)
    .reduce((sum, row) => sum + row.delta, 0);
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

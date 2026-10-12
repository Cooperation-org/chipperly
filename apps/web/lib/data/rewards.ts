'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';
import { nextPosition } from './_util';
import { effectiveLocationIds, locationFields, matchesLocation } from './activities';

export interface RewardsFilter {
  location_id?: string | null;
  always_available?: boolean;
}

/** Where a reward sits in one place's list ('all' = Every place). A place it was never moved in uses `position`. */
export function placePosition(row: Reward, placeKey: string): number {
  return row.positions?.[placeKey] ?? row.position;
}

/**
 * Pure: not-deleted, optionally scoped to a location (null-location rewards are everywhere) and/or always-available.
 * In a place, that place's own rewards come first in the order set for that place, then the Every place rewards in
 * theirs. With no location (the whole list), the order is `position`.
 */
export function filterRewards(rows: readonly Reward[], filter: RewardsFilter): Reward[] {
  const place = filter.location_id;
  const keyOf = (row: Reward): string =>
    place === undefined ? '' : place !== null && effectiveLocationIds(row).length > 0 ? place : 'all';
  const rank = (row: Reward): number => (keyOf(row) === 'all' ? 1 : 0);
  const at = (row: Reward): number => (place === undefined ? row.position : placePosition(row, keyOf(row)));
  return rows
    .filter((row) => row.deleted_at === null)
    .filter((row) => {
      if (place === undefined) return true;
      // null asks for rows that show everywhere only, as before.
      if (place === null) return effectiveLocationIds(row).length === 0;
      return matchesLocation(row, place);
    })
    .filter((row) => filter.always_available === undefined || row.always_available === filter.always_available)
    .sort((a, b) => rank(a) - rank(b) || at(a) - at(b) || a.name.localeCompare(b.name));
}

export function useRewards(profileId: string, { location_id, always_available }: RewardsFilter = {}): Reward[] {
  const rows = useLiveQuery(() => db.rewards.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(
    () => filterRewards(rows, { location_id, always_available }),
    [rows, location_id, always_available],
  );
}

export interface SaveRewardInput {
  id?: string;
  profile_id: string;
  name: string;
  emoji: string | null;
  photo_id: string | null;
  chip_cost: number | null;
  /** [] = every place. */
  location_ids: string[];
  always_available: boolean;
  /** Unlocked by finishing this activity today (#15 "after a task"); null for an ordinary reward. */
  requires_activity_id?: string | null;
  /** Minutes of screen time redeeming this grants (with `screen_time_packages`); null for an ordinary reward. */
  screen_time_minutes?: number | null;
  screen_time_packages?: string[] | null;
  screen_time_whole_phone?: boolean | null;
}

export async function saveReward(input: SaveRewardInput): Promise<string> {
  const existing = input.id ? await db.rewards.get(input.id) : undefined;
  const id = input.id ?? newId();
  const position = existing?.position ?? (await nextPosition(db.rewards, input.profile_id));
  await upsert('rewards', {
    id,
    profile_id: input.profile_id,
    version: existing?.version ?? 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    name: input.name,
    emoji: input.emoji,
    photo_id: input.photo_id,
    chip_cost: input.chip_cost,
    ...locationFields(input.location_ids),
    always_available: input.always_available,
    requires_activity_id: input.requires_activity_id ?? null,
    position,
    positions: existing?.positions ?? null,
    screen_time_minutes: input.screen_time_minutes ?? null,
    screen_time_packages: input.screen_time_packages ?? null,
    screen_time_whole_phone: input.screen_time_whole_phone ?? null,
  } satisfies Reward);
  return id;
}

export async function deleteReward(id: string): Promise<void> {
  await softDelete('rewards', id);
}

/** Saves `orderedIds` as the order inside one place ('all' = Every place). Other places keep theirs. Synced like any edit. */
export async function reorderRewards(placeKey: string, orderedIds: readonly string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    const row = await db.rewards.get(orderedIds[i] as string);
    if (row && row.positions?.[placeKey] !== i) await upsert('rewards', { ...row, positions: { ...row.positions, [placeKey]: i } });
  }
}

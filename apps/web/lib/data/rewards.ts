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

/** Pure: not-deleted, optionally scoped to a location (null-location rewards are everywhere) and/or always-available. */
export function filterRewards(rows: readonly Reward[], filter: RewardsFilter): Reward[] {
  return rows
    .filter((row) => row.deleted_at === null)
    .filter((row) => {
      if (filter.location_id === undefined) return true;
      // null asks for rows that show everywhere only, as before.
      if (filter.location_id === null) return effectiveLocationIds(row).length === 0;
      return matchesLocation(row, filter.location_id);
    })
    .filter((row) => filter.always_available === undefined || row.always_available === filter.always_available)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
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
    screen_time_minutes: input.screen_time_minutes ?? null,
    screen_time_packages: input.screen_time_packages ?? null,
    screen_time_whole_phone: input.screen_time_whole_phone ?? null,
  } satisfies Reward);
  return id;
}

export async function deleteReward(id: string): Promise<void> {
  await softDelete('rewards', id);
}

/**
 * Pure: move the reward at `from` to `to` within `groupIds` (a visible group, in display order) and return the new
 * full order. Only the moved reward changes slot, so every other group keeps its order.
 *
 * `mergedIds` is what the child sees for that group, in full-list order: Every place rewards plus this place's own.
 * The library shows a place group without the Every place rewards, so the move is placed against the merged list:
 * the top or bottom of the group is the top or bottom of the merged list, and any other move goes as far as it can
 * in its direction without passing the next reward of its own group. `mergedIds` must contain `groupIds`.
 */
export function moveWithinGroup(
  allIds: readonly string[],
  groupIds: readonly string[],
  from: number,
  to: number,
  mergedIds: readonly string[] = groupIds,
): string[] {
  const clamped = Math.max(0, Math.min(to, groupIds.length - 1));
  if (from === clamped || from < 0 || from >= groupIds.length) return [...allIds];
  const id = groupIds[from] as string;
  const next = [...groupIds];
  next.splice(clamped, 0, ...next.splice(from, 1));
  const rest = allIds.filter((x) => x !== id);
  const merged = mergedIds.filter((x) => x !== id);
  let at: number;
  if (clamped === 0) at = rest.indexOf(merged[0] as string);
  else if (clamped === next.length - 1) at = rest.indexOf(merged[merged.length - 1] as string) + 1;
  else if (clamped < from) at = rest.indexOf(next[clamped - 1] as string) + 1;
  else at = rest.indexOf(next[clamped + 1] as string);
  rest.splice(at, 0, id);
  return rest;
}

/** Writes position = index for every reward whose slot changed; synced like any other edit. */
export async function reorderRewards(orderedIds: readonly string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    const row = await db.rewards.get(orderedIds[i] as string);
    if (row && row.position !== i) await upsert('rewards', { ...row, position: i });
  }
}

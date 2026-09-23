'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';
import { nextPosition } from './_util';

export interface RewardsFilter {
  location_id?: string | null;
  always_available?: boolean;
}

/** Pure: not-deleted, optionally scoped to a location (null-location rewards are everywhere) and/or always-available. */
function filterRewards(rows: readonly Reward[], filter: RewardsFilter): Reward[] {
  return rows
    .filter((row) => row.deleted_at === null)
    .filter((row) => filter.location_id === undefined || row.location_id === filter.location_id || row.location_id === null)
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
  location_id: string | null;
  always_available: boolean;
  /** Minutes of screen time redeeming this grants (with `screen_time_packages`); null for an ordinary reward. */
  screen_time_minutes?: number | null;
  screen_time_packages?: string[] | null;
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
    location_id: input.location_id,
    always_available: input.always_available,
    position,
    screen_time_minutes: input.screen_time_minutes ?? null,
    screen_time_packages: input.screen_time_packages ?? null,
  } satisfies Reward);
  return id;
}

export async function deleteReward(id: string): Promise<void> {
  await softDelete('rewards', id);
}

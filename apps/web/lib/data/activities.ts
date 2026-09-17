'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity, ActivityStep, Recurrence } from '@chipperly/shared/schemas/activity';
import type { ScheduleItem } from '@chipperly/shared/schemas/schedule';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';
import { nextPosition } from './_util';

export function useActivities(profileId: string): Activity[] {
  const rows = useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(
    () =>
      rows
        .filter((row) => row.deleted_at === null)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [rows],
  );
}

export function useActivity(id: string): Activity | undefined {
  return useLiveQuery(() => db.activities.get(id), [id]);
}

export interface SaveActivityStepInput {
  id?: string;
  name: string;
  emoji: string | null;
  photo_id: string | null;
}

export interface SaveActivityInput {
  id?: string;
  profile_id: string;
  name: string;
  emoji: string | null;
  photo_id: string | null;
  chip_value: number;
  location_id: string | null;
  recurrence: Recurrence | null;
  recurrence_weekday: number | null;
  recurrence_time: string | null;
  steps: SaveActivityStepInput[];
}

/** Upserts the activity, then reconciles steps: upsert kept ones, soft-delete removed ones, renumber positions. */
export async function saveActivity(input: SaveActivityInput): Promise<string> {
  const existing = input.id ? await db.activities.get(input.id) : undefined;
  const id = input.id ?? newId();
  const position = existing?.position ?? (await nextPosition(db.activities, input.profile_id));

  await upsert('activities', {
    id,
    profile_id: input.profile_id,
    version: existing?.version ?? 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    name: input.name,
    emoji: input.emoji,
    photo_id: input.photo_id,
    chip_value: input.chip_value,
    location_id: input.location_id,
    recurrence: input.recurrence,
    recurrence_weekday: input.recurrence_weekday,
    recurrence_time: input.recurrence_time,
    position,
  } satisfies Activity);

  const existingSteps = await db.activity_steps.where('activity_id').equals(id).toArray();
  const existingById = new Map(existingSteps.map((step) => [step.id, step]));
  const keepIds = new Set(input.steps.filter((step) => step.id).map((step) => step.id as string));

  for (const step of existingSteps) {
    if (step.deleted_at === null && !keepIds.has(step.id)) await softDelete('activity_steps', step.id);
  }

  for (let i = 0; i < input.steps.length; i += 1) {
    const stepInput = input.steps[i] as SaveActivityStepInput;
    const stepId = stepInput.id ?? newId();
    const priorStep = existingById.get(stepId);
    await upsert('activity_steps', {
      id: stepId,
      profile_id: input.profile_id,
      version: priorStep?.version ?? 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      activity_id: id,
      position: i,
      name: stepInput.name,
      emoji: stepInput.emoji,
      photo_id: stepInput.photo_id,
    } satisfies ActivityStep);
  }

  return id;
}

export async function deleteActivity(id: string): Promise<void> {
  await softDelete('activities', id);
}

/** Pure: the ids of the last `n` distinct activities used, newest first. */
export function recentActivityIds(items: readonly ScheduleItem[], n: number): string[] {
  const sorted = items.filter((item) => item.deleted_at === null).sort((a, b) => b.client_updated_at - a.client_updated_at);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of sorted) {
    if (seen.has(item.activity_id)) continue;
    seen.add(item.activity_id);
    ids.push(item.activity_id);
    if (ids.length >= n) break;
  }
  return ids;
}

export function useRecentActivities(profileId: string, n: number): Activity[] {
  const items = useLiveQuery(() => db.schedule_items.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const activities = useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => {
    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    return recentActivityIds(items, n)
      .map((id) => byId.get(id))
      .filter((activity): activity is Activity => activity !== undefined && activity.deleted_at === null);
  }, [items, activities, n]);
}

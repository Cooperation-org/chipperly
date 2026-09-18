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
import { descendantsOf } from './schedule';

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

/** Pure: an activity IS a routine when it has at least one non-deleted step (docs/technical-plan.md section 5). */
export function isRoutine(activity: Activity, steps: readonly ActivityStep[]): boolean {
  return steps.some((step) => step.activity_id === activity.id && step.deleted_at === null);
}

/** Activities that are routines (have steps), alphabetical — same source as useActivities, just filtered. */
export function useRoutines(profileId: string): Activity[] {
  const activities = useActivities(profileId);
  const steps = useLiveQuery(() => db.activity_steps.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => activities.filter((activity) => isRoutine(activity, steps)), [activities, steps]);
}

export interface SaveActivityStepInput {
  id?: string;
  /** Another step's `id` in this same array; null/omitted for a root step. Must reference a step that has its own `id` set. */
  parent_step_id?: string | null;
  name: string;
  emoji: string | null;
  photo_id: string | null;
  duration_minutes: number | null;
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
  recurrence_weekdays: number[] | null;
  recurrence_time: string | null;
  steps: SaveActivityStepInput[];
}

/**
 * Upserts the activity, then reconciles the whole step set: upsert kept
 * ones, soft-delete removed ones (and every descendant of a removed step,
 * even one still listed in `input.steps` — the parent's removal wins), and
 * renumber `position` per parent group in array order.
 */
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
    recurrence_weekdays: input.recurrence_weekdays,
    recurrence_time: input.recurrence_time,
    position,
  } satisfies Activity);

  const existingSteps = await db.activity_steps.where('activity_id').equals(id).toArray();
  const existingById = new Map(existingSteps.map((step) => [step.id, step]));
  const keepIds = new Set(input.steps.filter((step) => step.id).map((step) => step.id as string));

  const removedIds = existingSteps.filter((step) => step.deleted_at === null && !keepIds.has(step.id)).map((step) => step.id);
  const toRemove = new Set(removedIds);
  for (const removedId of removedIds) {
    for (const descendantId of descendantsOf(existingSteps, removedId)) toRemove.add(descendantId);
  }
  for (const stepId of toRemove) {
    if (existingById.get(stepId)?.deleted_at === null) await softDelete('activity_steps', stepId);
  }

  // Final id per input step (existing steps keep theirs; new ones get one
  // now so a step can be referenced as another's parent within this call).
  const stepIds = input.steps.map((step) => step.id ?? newId());
  const idByGivenId = new Map(input.steps.map((step, i) => [step.id, stepIds[i] as string]));
  const positionByParent = new Map<string | null, number>();

  for (let i = 0; i < input.steps.length; i += 1) {
    const stepInput = input.steps[i] as SaveActivityStepInput;
    const stepId = stepIds[i] as string;
    if (toRemove.has(stepId)) continue;

    const parentGivenId = stepInput.parent_step_id ?? null;
    const parent_step_id = parentGivenId !== null ? (idByGivenId.get(parentGivenId) ?? null) : null;
    const position = positionByParent.get(parent_step_id) ?? 0;
    positionByParent.set(parent_step_id, position + 1);

    const priorStep = existingById.get(stepId);
    await upsert('activity_steps', {
      id: stepId,
      profile_id: input.profile_id,
      version: priorStep?.version ?? 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      activity_id: id,
      parent_step_id,
      position,
      name: stepInput.name,
      emoji: stepInput.emoji,
      photo_id: stepInput.photo_id,
      duration_minutes: stepInput.duration_minutes,
    } satisfies ActivityStep);
  }

  return id;
}

export async function deleteActivity(id: string): Promise<void> {
  await softDelete('activities', id);
}

/** Pure: the ids of the last `n` distinct activities used, newest first. */
function recentActivityIds(items: readonly ScheduleItem[], n: number): string[] {
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

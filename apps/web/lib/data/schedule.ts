'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity, ActivityStep } from '@chipperly/shared/schemas/activity';
import type { ScheduleItem, StepCompletion } from '@chipperly/shared/schemas/schedule';
import type { RecurrenceSkip } from '@chipperly/shared/schemas/activity';
import type { ChipLedger } from '@chipperly/shared/schemas/chips';
import { occursOn, materializedId } from '@chipperly/shared/helpers/recurrence';
import { todayIso } from '@chipperly/shared/helpers/date';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';
import { pullProfile } from '../sync/engine';
import { getActiveLocationId } from './locations';
import { getMoodLevel } from './mood';

export interface DayStep {
  step: ActivityStep;
  completed_at: number | null;
  completed_by: string | null;
  /** id of the step_completion row backing this state, for undo. */
  completion_id: string | null;
  /** 0 for a root step, +1 per ancestor; lets a flat list render indented. */
  depth: number;
}

export interface DayItem {
  item: ScheduleItem;
  activity: Activity;
  steps: DayStep[];
}

/** One step tree node: its own day state plus its ordered children. */
export interface StepNode {
  node: DayStep;
  children: StepNode[];
  done: boolean;
}

/**
 * Pure: groups flat steps into a tree by `parent_step_id`, siblings ordered
 * by `step.position`. A leaf is done when it has its own completion; a
 * parent is done when every child is done, or it has its own completion
 * (the cascade in `setStepCompleted` keeps that in sync either way).
 */
export function stepTree(steps: readonly DayStep[]): StepNode[] {
  const childrenByParent = new Map<string | null, DayStep[]>();
  for (const day of steps) {
    const parentId = day.step.parent_step_id;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(day);
    childrenByParent.set(parentId, list);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => a.step.position - b.step.position);

  function build(day: DayStep, depth: number): StepNode {
    const children = (childrenByParent.get(day.step.id) ?? []).map((child) => build(child, depth + 1));
    const done = children.length > 0 ? children.every((child) => child.done) || day.completed_at !== null : day.completed_at !== null;
    return { node: { ...day, depth }, children, done };
  }

  return (childrenByParent.get(null) ?? []).map((root) => build(root, 0));
}

/** Pure: every id of `stepId`'s descendants (children, grandchildren, ...), depth-first. */
export function descendantsOf(steps: readonly Pick<ActivityStep, 'id' | 'parent_step_id'>[], stepId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const step of steps) {
    if (step.parent_step_id === null) continue;
    const list = childrenOf.get(step.parent_step_id) ?? [];
    list.push(step.id);
    childrenOf.set(step.parent_step_id, list);
  }
  const result: string[] = [];
  const stack = [...(childrenOf.get(stepId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    result.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return result;
}

/** Flattens a step tree depth-first (parent immediately followed by its children). */
function flattenPreOrder(nodes: readonly StepNode[]): DayStep[] {
  const result: DayStep[] = [];
  for (const node of nodes) {
    result.push(node.node);
    result.push(...flattenPreOrder(node.children));
  }
  return result;
}

/** Part of day for a recurring item from its HH:MM time: before noon, before five, else evening. Null without a time. */
export function partOfDayFor(hhmm: string | null | undefined): 'morning' | 'afternoon' | 'evening' | null {
  if (!hhmm) return null;
  const hour = Number(hhmm.slice(0, 2));
  if (!Number.isFinite(hour)) return null;
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Pure join: schedule_items (not deleted) for a day, with their activity
 * and ordered, non-deleted steps and completions. `items` is expected to
 * already be scoped to one profile + date (the [profile_id+date] Dexie
 * index does that for the hook below); this function only applies the
 * "not deleted" filter and the sort.
 */
export function joinDayItems(
  items: readonly ScheduleItem[],
  activities: readonly Activity[],
  steps: readonly ActivityStep[],
  completions: readonly StepCompletion[],
): DayItem[] {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  const stepsByActivity = new Map<string, ActivityStep[]>();
  for (const step of steps) {
    if (step.deleted_at !== null) continue;
    const list = stepsByActivity.get(step.activity_id) ?? [];
    list.push(step);
    stepsByActivity.set(step.activity_id, list);
  }
  const completionsByItem = new Map<string, StepCompletion[]>();
  for (const completion of completions) {
    if (completion.deleted_at !== null) continue;
    const list = completionsByItem.get(completion.schedule_item_id) ?? [];
    list.push(completion);
    completionsByItem.set(completion.schedule_item_id, list);
  }

  const result: DayItem[] = [];
  for (const item of items) {
    if (item.deleted_at !== null) continue;
    const activity = activityById.get(item.activity_id);
    if (!activity) continue;

    const activitySteps = stepsByActivity.get(item.activity_id) ?? [];
    const completionByStep = new Map(
      (completionsByItem.get(item.id) ?? []).map((completion) => [completion.activity_step_id, completion]),
    );
    const daySteps: DayStep[] = activitySteps.map((step) => {
      const completion = completionByStep.get(step.id);
      return {
        step,
        completed_at: completion?.completed_at ?? null,
        completed_by: completion?.completed_by ?? null,
        completion_id: completion?.id ?? null,
        depth: 0,
      };
    });

    // Pre-order walk of the step tree so a flat consumer can indent by depth.
    result.push({ item, activity, steps: flattenPreOrder(stepTree(daySteps)) });
  }

  result.sort((a, b) => {
    if (a.item.position !== b.item.position) return a.item.position - b.item.position;
    return (a.item.start_time ?? '').localeCompare(b.item.start_time ?? '');
  });
  return result;
}

/** Pure: the step-complete-parent rule (S6 "Checking every step checks the parent"). */
export function allStepsComplete(
  steps: readonly Pick<ActivityStep, 'id' | 'deleted_at'>[],
  completions: readonly Pick<StepCompletion, 'activity_step_id' | 'deleted_at'>[],
): boolean {
  const liveSteps = steps.filter((step) => step.deleted_at === null);
  if (liveSteps.length === 0) return false;
  const completedIds = new Set(
    completions.filter((completion) => completion.deleted_at === null).map((completion) => completion.activity_step_id),
  );
  return liveSteps.every((step) => completedIds.has(step.id));
}

export function useDayItems(profileId: string, isoDate: string): DayItem[] {
  const items = useLiveQuery(
    () => db.schedule_items.where('[profile_id+date]').equals([profileId, isoDate]).toArray(),
    [profileId, isoDate],
    [],
  );
  const activities =
    useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const steps =
    useLiveQuery(() => db.activity_steps.where('profile_id').equals(profileId).toArray(), [profileId], []);
  // Scoped to this day's schedule_item ids via the schedule_item_id index,
  // not a profile_id scan of the whole (append-only, uncapped) history.
  const completions = useLiveQuery(
    () => {
      const ids = items.map((item) => item.id);
      return ids.length > 0
        ? db.step_completions.where('schedule_item_id').anyOf(ids).toArray()
        : Promise.resolve<StepCompletion[]>([]);
    },
    [items],
    [],
  );

  return useMemo(() => joinDayItems(items, activities, steps, completions), [items, activities, steps, completions]);
}

export async function addToDay(profileId: string, isoDate: string, activityId: string): Promise<string> {
  const position = await nextDayPosition(profileId, isoDate);
  const id = newId();
  const row: ScheduleItem = {
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    date: isoDate,
    position,
    activity_id: activityId,
    start_time: null,
    part_of_day: null,
    source: 'manual',
    completed_at: null,
    completed_by: null,
  };
  await upsert('schedule_items', row);
  return id;
}

async function nextDayPosition(profileId: string, isoDate: string): Promise<number> {
  const items = await db.schedule_items.where('[profile_id+date]').equals([profileId, isoDate]).toArray();
  return items.reduce((max, item) => (item.deleted_at === null ? Math.max(max, item.position) : max), -1) + 1;
}

/**
 * Sets completed_at/completed_by and, when awarding, mirrors S6's "checking
 * the parent with steps asks nothing, it checks all steps" rule. Awards a
 * chip through the ledger when the activity earns one; undoing appends a
 * compensating 'adjust' row instead of touching the earlier row (ledger is
 * append-only).
 */
export async function setCompleted(itemId: string, done: boolean, userId: string): Promise<void> {
  const item = await db.schedule_items.get(itemId);
  if (!item) return;
  await markItemCompletion(item, done, userId);
  if (!done) return;

  const steps = (await db.activity_steps.where('activity_id').equals(item.activity_id).toArray()).filter(
    (step) => step.deleted_at === null,
  );
  if (steps.length === 0) return;

  const completions = await db.step_completions.where('schedule_item_id').equals(itemId).toArray();
  const completedIds = new Set(
    completions.filter((completion) => completion.deleted_at === null).map((completion) => completion.activity_step_id),
  );
  for (const step of steps) {
    if (completedIds.has(step.id)) continue;
    await upsert('step_completions', {
      id: newId(),
      profile_id: item.profile_id,
      version: 0,
      client_updated_at: now(),
      updated_by: userId,
      deleted_at: null,
      schedule_item_id: itemId,
      activity_step_id: step.id,
      completed_at: now(),
      completed_by: userId,
    } satisfies StepCompletion);
  }
}

async function markItemCompletion(item: ScheduleItem, done: boolean, userId: string): Promise<void> {
  await upsert('schedule_items', {
    ...item,
    completed_at: done ? now() : null,
    completed_by: done ? userId : null,
  });
  await syncChipLedgerForCompletion(item, done, userId);
}

async function syncChipLedgerForCompletion(item: ScheduleItem, done: boolean, userId: string): Promise<void> {
  const activity = await db.activities.get(item.activity_id);

  if (done) {
    if (!activity || activity.chip_value <= 0) return;
    const locationId = activity.location_id ?? (await getActiveLocationId(item.profile_id));
    await appendLedgerRow(item.profile_id, locationId, 'task', item.id, activity.chip_value, userId);
    return;
  }

  // Undo: never remove the award, append a compensating row that nets this
  // item's ledger contribution to zero (only when something was awarded).
  const rows = (await db.chip_ledger.where('profile_id').equals(item.profile_id).toArray()).filter(
    (row) => row.ref_id === item.id && row.deleted_at === null,
  );
  const net = rows.reduce((sum, row) => sum + row.delta, 0);
  if (net === 0) return;
  const locationId = activity?.location_id ?? (await getActiveLocationId(item.profile_id));
  await appendLedgerRow(item.profile_id, locationId, 'adjust', item.id, -net, userId);
}

async function appendLedgerRow(
  profileId: string,
  locationId: string | null,
  reason: ChipLedger['reason'],
  refId: string,
  delta: number,
  userId: string,
): Promise<void> {
  const mood_level = await getMoodLevel(profileId, todayIso());
  await upsert('chip_ledger', {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: userId,
    deleted_at: null,
    location_id: locationId,
    delta,
    reason,
    ref_id: refId,
    created_at: now(),
    created_by: userId,
    mood_level,
  } satisfies ChipLedger);
}

/**
 * Toggles one step and cascades through the tree: checking a parent
 * completes it and every descendant not already complete; unchecking a
 * parent un-completes it and every descendant. Either way, every ancestor
 * above `stepId` is then recomputed (done iff all of that ancestor's
 * children are), so completing the last sibling completes the parent and
 * so on up the chain. The activity completes when every root step is done.
 */
export async function setStepCompleted(itemId: string, stepId: string, done: boolean, userId: string): Promise<void> {
  const item = await db.schedule_items.get(itemId);
  if (!item) return;
  const profileId = item.profile_id;

  const steps = (await db.activity_steps.where('activity_id').equals(item.activity_id).toArray()).filter(
    (step) => step.deleted_at === null,
  );
  const stepById = new Map(steps.map((step) => [step.id, step]));

  const completions = await db.step_completions.where('schedule_item_id').equals(itemId).toArray();
  const liveByStep = new Map(
    completions.filter((completion) => completion.deleted_at === null).map((completion) => [completion.activity_step_id, completion]),
  );

  async function set(id: string, isDone: boolean): Promise<void> {
    const existing = liveByStep.get(id);
    if (isDone && !existing) {
      const row: StepCompletion = {
        id: newId(),
        profile_id: profileId,
        version: 0,
        client_updated_at: now(),
        updated_by: userId,
        deleted_at: null,
        schedule_item_id: itemId,
        activity_step_id: id,
        completed_at: now(),
        completed_by: userId,
      };
      await upsert('step_completions', row);
      liveByStep.set(id, row);
    } else if (!isDone && existing) {
      await softDelete('step_completions', existing.id);
      liveByStep.delete(id);
    }
  }

  await set(stepId, done);
  for (const descendantId of descendantsOf(steps, stepId)) await set(descendantId, done);

  for (let current = stepById.get(stepId); current?.parent_step_id; current = stepById.get(current.parent_step_id)) {
    const parentId = current.parent_step_id;
    const siblings = steps.filter((step) => step.parent_step_id === parentId);
    await set(parentId, siblings.every((sibling) => liveByStep.has(sibling.id)));
  }

  const roots = steps.filter((step) => step.parent_step_id === null);
  const complete = allStepsComplete(roots, [...liveByStep.values()]);
  if (complete !== (item.completed_at !== null)) {
    await markItemCompletion(item, complete, userId);
  }
}

/** Attaches (or clears, with `null`) the social story shown on this item's Story row (S7) and, in
 * child mode, its "Read story" button (S32). Same upsert shape as `setTime`/`setPartOfDay` above. */
export async function setItemStory(itemId: string, storyId: string | null): Promise<void> {
  const item = await db.schedule_items.get(itemId);
  if (!item) return;
  await upsert('schedule_items', { ...item, story_id: storyId });
}

/**
 * Soft-deletes the item. For a recurring item: scope 'always' clears the
 * activity's recurrence (it stops generating occurrences at all); scope
 * 'today' records a recurrence_skips row so only this date is suppressed.
 */
export async function removeFromDay(itemId: string, scope: 'today' | 'always'): Promise<void> {
  const item = await db.schedule_items.get(itemId);
  if (!item) return;
  await softDelete('schedule_items', itemId);
  if (item.source !== 'recurring') return;

  if (scope === 'always') {
    const activity = await db.activities.get(item.activity_id);
    if (activity) await upsert('activities', { ...activity, recurrence: null });
    return;
  }

  await upsert('recurrence_skips', {
    id: newId(),
    profile_id: item.profile_id,
    version: 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    activity_id: item.activity_id,
    date: item.date,
  } satisfies RecurrenceSkip);
}

export async function reorder(profileId: string, isoDate: string, orderedIds: readonly string[]): Promise<void> {
  const items = await db.schedule_items.where('[profile_id+date]').equals([profileId, isoDate]).toArray();
  const byId = new Map(items.map((item) => [item.id, item]));
  for (let i = 0; i < orderedIds.length; i += 1) {
    const item = byId.get(orderedIds[i] as string);
    if (!item || item.position === i) continue;
    await upsert('schedule_items', { ...item, position: i });
  }
}

/**
 * Materializes every recurring activity that occurs on `isoDate` and has no
 * item yet. `materializedId` is deterministic (activity id + date), so two
 * devices opening the same day produce the same row and the server's
 * upsert treats the second push as a no-op (technical-plan.md "Recurrence
 * on the client").
 */
async function materializeRecurring(profileId: string, isoDate: string): Promise<void> {
  const activities = (await db.activities.where('profile_id').equals(profileId).toArray()).filter(
    (activity) => activity.deleted_at === null && activity.recurrence !== null,
  );
  if (activities.length === 0) return;

  const skips = (await db.recurrence_skips.where('profile_id').equals(profileId).toArray()).filter(
    (skip) => skip.deleted_at === null,
  );
  const existingItems = await db.schedule_items.where('[profile_id+date]').equals([profileId, isoDate]).toArray();
  const existingIds = new Set(existingItems.filter((item) => item.deleted_at === null).map((item) => item.id));
  let position = existingItems.reduce((max, item) => (item.deleted_at === null ? Math.max(max, item.position) : max), -1) + 1;

  for (const activity of activities) {
    const activitySkips = skips.filter((skip) => skip.activity_id === activity.id);
    if (!occursOn(activity, isoDate, activitySkips)) continue;

    const id = materializedId(activity.id, isoDate);
    if (existingIds.has(id)) continue;

    await upsert('schedule_items', {
      id,
      profile_id: profileId,
      version: 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      date: isoDate,
      position,
      activity_id: activity.id,
      start_time: activity.recurrence_time,
      part_of_day: partOfDayFor(activity.recurrence_time),
      source: 'recurring',
      completed_at: null,
      completed_by: null,
    } satisfies ScheduleItem);
    existingIds.add(id);
    position += 1;
  }
}

/** One previewed entry: a real item's id, or a deterministic `materializedId` for a not-yet-materialized occurrence. */
export interface PreviewItem {
  id: string;
  activity: Activity;
}

/**
 * What `isoDate` would show without writing anything: `manualItems` (any
 * schedule_items already on that date, whatever their source) in their
 * existing order, then recurring activities that would materialize onto it
 * -- same `occursOn` + dedup-by-materialized-id rule as
 * `materializeRecurring` above -- sorted by recurrence time. Used to
 * preview tomorrow on the child's Today (S32 TomorrowBand) a day before
 * `materializeRecurringFresh` would actually create those rows.
 */
export function previewDay(
  activities: readonly Activity[],
  skips: readonly RecurrenceSkip[],
  manualItems: readonly ScheduleItem[],
  isoDate: string,
): PreviewItem[] {
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const liveManual = manualItems.filter((item) => item.deleted_at === null);
  const existingIds = new Set(liveManual.map((item) => item.id));

  const manualPreview: PreviewItem[] = liveManual
    .slice()
    .sort((a, b) => (a.position !== b.position ? a.position - b.position : (a.start_time ?? '').localeCompare(b.start_time ?? '')))
    .flatMap((item) => {
      const activity = activityById.get(item.activity_id);
      return activity ? [{ id: item.id, activity }] : [];
    });

  const skipsByActivity = new Map<string, RecurrenceSkip[]>();
  for (const skip of skips) {
    if (skip.deleted_at !== null) continue;
    const list = skipsByActivity.get(skip.activity_id) ?? [];
    list.push(skip);
    skipsByActivity.set(skip.activity_id, list);
  }

  const recurringPreview: PreviewItem[] = activities
    .filter((a) => a.deleted_at === null && a.recurrence !== null)
    .filter((a) => occursOn(a, isoDate, skipsByActivity.get(a.id) ?? []))
    .filter((a) => !existingIds.has(materializedId(a.id, isoDate)))
    .sort((a, b) => (a.recurrence_time ?? '99:99').localeCompare(b.recurrence_time ?? '99:99') || a.name.localeCompare(b.name))
    .map((a) => ({ id: materializedId(a.id, isoDate), activity: a }));

  return [...manualPreview, ...recurringPreview];
}

/**
 * `materializeRecurring`, but pulls this profile first (best-effort, only
 * when online). Today screens call this instead on every load: without a
 * fresh pull, a device that hasn't yet learned about another device's
 * "remove today" delete + recurrence_skips can regenerate the item with a
 * fresh client_updated_at, and the server's ordinary LWW resurrects it for
 * everyone (technical-plan.md "Recurrence on the client").
 */
export async function materializeRecurringFresh(profileId: string, isoDate: string): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    await pullProfile(profileId).catch(() => {});
  }
  await materializeRecurring(profileId, isoDate);
}

/** Copies non-deleted items from one day to another as new manual items. */
export async function copyDay(profileId: string, fromIso: string, toIso: string): Promise<void> {
  const fromItems = (await db.schedule_items.where('[profile_id+date]').equals([profileId, fromIso]).toArray())
    .filter((item) => item.deleted_at === null)
    .sort((a, b) => a.position - b.position);
  if (fromItems.length === 0) return;

  let position = await nextDayPosition(profileId, toIso);
  for (const item of fromItems) {
    await upsert('schedule_items', {
      id: newId(),
      profile_id: profileId,
      version: 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      date: toIso,
      position,
      activity_id: item.activity_id,
      start_time: item.start_time,
      part_of_day: item.part_of_day,
      source: 'manual',
      completed_at: null,
      completed_by: null,
    } satisfies ScheduleItem);
    position += 1;
  }
}

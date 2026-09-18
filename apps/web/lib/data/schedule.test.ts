import { describe, expect, it } from 'vitest';
import type { Activity, ActivityStep } from '@chipperly/shared/schemas/activity';
import type { ScheduleItem, StepCompletion } from '@chipperly/shared/schemas/schedule';
import { allStepsComplete, joinDayItems } from './schedule';

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    name: 'Brush teeth',
    emoji: '🪥',
    photo_id: null,
    chip_value: 1,
    location_id: null,
    recurrence: null,
    recurrence_weekdays: null,
    recurrence_time: null,
    position: 0,
    ...overrides,
  };
}

function item(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'item-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    date: '2026-09-17',
    position: 0,
    activity_id: 'act-1',
    start_time: null,
    part_of_day: null,
    source: 'manual',
    completed_at: null,
    completed_by: null,
    ...overrides,
  };
}

function step(overrides: Partial<ActivityStep> = {}): ActivityStep {
  return {
    id: 'step-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    activity_id: 'act-1',
    position: 0,
    name: 'Wet brush',
    emoji: null,
    photo_id: null,
    duration_minutes: null,
    ...overrides,
  };
}

function completion(overrides: Partial<StepCompletion> = {}): StepCompletion {
  return {
    id: 'comp-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    schedule_item_id: 'item-1',
    activity_step_id: 'step-1',
    completed_at: 100,
    completed_by: 'user-1',
    ...overrides,
  };
}

describe('joinDayItems', () => {
  it('joins activities and steps, sorted by position then start_time', () => {
    const items = [
      item({ id: 'item-b', activity_id: 'act-b', position: 1, start_time: '08:00' }),
      item({ id: 'item-a', activity_id: 'act-a', position: 0, start_time: '09:00' }),
      item({ id: 'item-c', activity_id: 'act-a', position: 0, start_time: '07:00' }),
    ];
    const activities = [activity({ id: 'act-a', name: 'A' }), activity({ id: 'act-b', name: 'B' })];

    const result = joinDayItems(items, activities, [], []);

    expect(result.map((row) => row.item.id)).toEqual(['item-c', 'item-a', 'item-b']);
  });

  it('drops soft-deleted items and items whose activity is missing', () => {
    const items = [item({ id: 'gone', deleted_at: 123 }), item({ id: 'orphan', activity_id: 'missing' })];
    const result = joinDayItems(items, [activity()], [], []);
    expect(result).toHaveLength(0);
  });

  it('attaches ordered, non-deleted steps with their completion state', () => {
    const items = [item()];
    const activities = [activity()];
    const steps = [
      step({ id: 'step-2', position: 1, name: 'Rinse' }),
      step({ id: 'step-1', position: 0, name: 'Wet brush' }),
      step({ id: 'step-gone', position: 2, deleted_at: 5 }),
    ];
    const completions = [completion({ id: 'comp-1', activity_step_id: 'step-1' })];

    const [dayItem] = joinDayItems(items, activities, steps, completions);

    expect(dayItem?.steps.map((s) => s.step.id)).toEqual(['step-1', 'step-2']);
    expect(dayItem?.steps[0]?.completed_at).toBe(100);
    expect(dayItem?.steps[1]?.completed_at).toBeNull();
  });
});

describe('allStepsComplete', () => {
  it('is false when the activity has no steps', () => {
    expect(allStepsComplete([], [])).toBe(false);
  });

  it('is false until every non-deleted step has a live completion', () => {
    const steps = [step({ id: 's1' }), step({ id: 's2' })];
    const completions = [completion({ activity_step_id: 's1' })];
    expect(allStepsComplete(steps, completions)).toBe(false);
  });

  it('is true once every step is completed', () => {
    const steps = [step({ id: 's1' }), step({ id: 's2' })];
    const completions = [completion({ id: 'c1', activity_step_id: 's1' }), completion({ id: 'c2', activity_step_id: 's2' })];
    expect(allStepsComplete(steps, completions)).toBe(true);
  });

  it('ignores a soft-deleted completion (undo)', () => {
    const steps = [step({ id: 's1' })];
    const completions = [completion({ activity_step_id: 's1', deleted_at: 999 })];
    expect(allStepsComplete(steps, completions)).toBe(false);
  });

  it('ignores a soft-deleted step', () => {
    const steps = [step({ id: 's1', deleted_at: 999 }), step({ id: 's2' })];
    const completions = [completion({ activity_step_id: 's2' })];
    expect(allStepsComplete(steps, completions)).toBe(true);
  });
});

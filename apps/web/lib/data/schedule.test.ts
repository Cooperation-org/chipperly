import { describe, expect, it } from 'vitest';
import type { Activity, ActivityStep } from '@chipperly/shared/schemas/activity';
import type { ScheduleItem, StepCompletion } from '@chipperly/shared/schemas/schedule';
import { allStepsComplete, descendantsOf, joinDayItems, stepTree, type DayStep } from './schedule';

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
    parent_step_id: null,
    position: 0,
    name: 'Wet brush',
    emoji: null,
    photo_id: null,
    duration_minutes: null,
    ...overrides,
  };
}

function daySteps(steps: readonly ActivityStep[], completedIds: readonly string[] = []): DayStep[] {
  return steps.map((s) => ({
    step: s,
    completed_at: completedIds.includes(s.id) ? 100 : null,
    completed_by: completedIds.includes(s.id) ? 'user-1' : null,
    completion_id: completedIds.includes(s.id) ? `comp-${s.id}` : null,
    depth: 0,
  }));
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

describe('stepTree', () => {
  it('nests by parent_step_id, siblings ordered by position', () => {
    const steps = [
      step({ id: 'r2', parent_step_id: null, position: 1, name: 'Root 2' }),
      step({ id: 'r1', parent_step_id: null, position: 0, name: 'Root 1' }),
      step({ id: 'c2', parent_step_id: 'r2', position: 1, name: 'Child 2' }),
      step({ id: 'c1', parent_step_id: 'r2', position: 0, name: 'Child 1' }),
    ];
    const tree = stepTree(daySteps(steps));

    expect(tree.map((n) => n.node.step.id)).toEqual(['r1', 'r2']);
    expect(tree[1]?.children.map((n) => n.node.step.id)).toEqual(['c1', 'c2']);
    expect(tree[0]?.children).toEqual([]);
  });

  it('assigns depth by nesting level', () => {
    const steps = [
      step({ id: 'r1', parent_step_id: null }),
      step({ id: 'c1', parent_step_id: 'r1' }),
      step({ id: 'g1', parent_step_id: 'c1' }),
    ];
    const [root] = stepTree(daySteps(steps));
    expect(root?.node.depth).toBe(0);
    expect(root?.children[0]?.node.depth).toBe(1);
    expect(root?.children[0]?.children[0]?.node.depth).toBe(2);
  });

  it('a leaf is done only by its own completion', () => {
    const steps = [step({ id: 'r1' })];
    expect(stepTree(daySteps(steps))[0]?.done).toBe(false);
    expect(stepTree(daySteps(steps, ['r1']))[0]?.done).toBe(true);
  });

  it('a parent is done once every child is done, with no completion of its own', () => {
    const steps = [
      step({ id: 'r1', parent_step_id: null }),
      step({ id: 'c1', parent_step_id: 'r1', position: 0 }),
      step({ id: 'c2', parent_step_id: 'r1', position: 1 }),
    ];
    expect(stepTree(daySteps(steps, ['c1']))[0]?.done).toBe(false);
    expect(stepTree(daySteps(steps, ['c1', 'c2']))[0]?.done).toBe(true);
  });

  it('a parent with an unfinished child is still done if it has its own completion', () => {
    const steps = [
      step({ id: 'r1', parent_step_id: null }),
      step({ id: 'c1', parent_step_id: 'r1', position: 0 }),
    ];
    expect(stepTree(daySteps(steps, ['r1']))[0]?.done).toBe(true);
  });
});

describe('descendantsOf', () => {
  it('is empty for a leaf', () => {
    expect(descendantsOf([step({ id: 'r1' })], 'r1')).toEqual([]);
  });

  it('returns direct children', () => {
    const steps = [step({ id: 'r1' }), step({ id: 'c1', parent_step_id: 'r1' }), step({ id: 'c2', parent_step_id: 'r1' })];
    expect(descendantsOf(steps, 'r1').sort()).toEqual(['c1', 'c2']);
  });

  it('walks every level, not just direct children', () => {
    const steps = [
      step({ id: 'r1' }),
      step({ id: 'c1', parent_step_id: 'r1' }),
      step({ id: 'g1', parent_step_id: 'c1' }),
      step({ id: 'g2', parent_step_id: 'c1' }),
    ];
    expect(descendantsOf(steps, 'r1').sort()).toEqual(['c1', 'g1', 'g2']);
  });
});

describe('cascade rules (pure, via stepTree + descendantsOf)', () => {
  it('checking a step also completes every descendant', () => {
    const steps = [
      step({ id: 'r1' }),
      step({ id: 'c1', parent_step_id: 'r1', position: 0 }),
      step({ id: 'g1', parent_step_id: 'c1', position: 0 }),
    ];
    // Simulates setStepCompleted(itemId, 'r1', true, userId): completing r1
    // means r1 and every id from descendantsOf(steps, 'r1') get a completion.
    const completed = ['r1', ...descendantsOf(steps, 'r1')];
    const [root] = stepTree(daySteps(steps, completed));
    expect(root?.done).toBe(true);
    expect(root?.children[0]?.done).toBe(true);
    expect(root?.children[0]?.children[0]?.done).toBe(true);
  });

  it('completing the last sibling completes the parent, and up the chain', () => {
    const steps = [
      step({ id: 'root' }),
      step({ id: 'mid', parent_step_id: 'root', position: 0 }),
      step({ id: 'leaf1', parent_step_id: 'mid', position: 0 }),
      step({ id: 'leaf2', parent_step_id: 'mid', position: 1 }),
    ];

    const beforeLast = stepTree(daySteps(steps, ['leaf1']));
    expect(beforeLast[0]?.children[0]?.done).toBe(false);
    expect(beforeLast[0]?.done).toBe(false);

    const afterLast = stepTree(daySteps(steps, ['leaf1', 'leaf2']));
    expect(afterLast[0]?.children[0]?.done).toBe(true); // mid: both leaves done
    expect(afterLast[0]?.done).toBe(true); // root: its only child (mid) is done
  });

  it('unchecking a parent leaves its descendants without a completion (nothing "done")', () => {
    const steps = [step({ id: 'r1' }), step({ id: 'c1', parent_step_id: 'r1' })];
    // Simulates setStepCompleted(itemId, 'r1', false, userId) after everything
    // was complete: neither r1 nor its descendants keep a live completion.
    const [root] = stepTree(daySteps(steps, []));
    expect(root?.done).toBe(false);
    expect(root?.children[0]?.done).toBe(false);
  });
});

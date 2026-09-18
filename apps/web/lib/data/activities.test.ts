import { describe, expect, it } from 'vitest';
import type { Activity, ActivityStep } from '@chipperly/shared/schemas/activity';
import { isRoutine } from './activities';

function makeActivity(id: string): Activity {
  return {
    id,
    profile_id: 'p',
    version: 0,
    client_updated_at: 0,
    updated_by: 'u',
    deleted_at: null,
    name: id,
    emoji: null,
    photo_id: null,
    chip_value: 0,
    location_id: null,
    recurrence: null,
    recurrence_weekday: null,
    recurrence_time: null,
    position: 0,
  };
}

function makeStep(activityId: string, overrides: { id?: string; deleted_at?: number | null } = {}): ActivityStep {
  return {
    id: overrides.id ?? `${activityId}-step`,
    profile_id: 'p',
    version: 0,
    client_updated_at: 0,
    updated_by: 'u',
    deleted_at: overrides.deleted_at ?? null,
    activity_id: activityId,
    position: 0,
    name: 'Step',
    emoji: null,
    photo_id: null,
  };
}

describe('isRoutine', () => {
  it('is false for an activity with no steps', () => {
    expect(isRoutine(makeActivity('a'), [])).toBe(false);
  });

  it('is true when at least one non-deleted step belongs to the activity', () => {
    expect(isRoutine(makeActivity('a'), [makeStep('a')])).toBe(true);
  });

  it('ignores deleted steps and steps belonging to other activities', () => {
    const steps = [makeStep('a', { deleted_at: 123 }), makeStep('b')];
    expect(isRoutine(makeActivity('a'), steps)).toBe(false);
  });
});

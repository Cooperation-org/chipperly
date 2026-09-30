import { describe, expect, it } from 'vitest';
import type { Activity, ActivityStep } from '@chipperly/shared/schemas/activity';
import { effectiveLocationIds, isRoutine, locationFields, matchesLocation } from './activities';
import { filterRewards } from './rewards';

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
    location_ids: [],
    recurrence: null,
    recurrence_weekdays: null,
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
    parent_step_id: null,
    position: 0,
    name: 'Step',
    emoji: null,
    photo_id: null,
    duration_minutes: null,
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

describe('location matching', () => {
  it('a row in every place matches any place', () => {
    expect(matchesLocation({ location_id: null, location_ids: [] }, 'home')).toBe(true);
    expect(matchesLocation({ location_id: null, location_ids: [] }, 'school')).toBe(true);
  });

  it('a row in two places matches those two and not a third', () => {
    const row = locationFields(['home', 'school']);
    expect(matchesLocation(row, 'home')).toBe(true);
    expect(matchesLocation(row, 'school')).toBe(true);
    expect(matchesLocation(row, 'camp')).toBe(false);
  });

  it('a legacy single-location row still matches', () => {
    expect(matchesLocation({ location_id: 'home' }, 'home')).toBe(true);
    expect(matchesLocation({ location_id: 'home', location_ids: null }, 'school')).toBe(false);
    expect(matchesLocation({ location_id: null }, 'school')).toBe(true);
  });

  it('a legacy edit of location_id beats stale location_ids', () => {
    expect(effectiveLocationIds({ location_id: 'school', location_ids: ['home'] })).toEqual(['school']);
    expect(effectiveLocationIds({ location_id: null, location_ids: ['home'] })).toEqual([]);
    expect(effectiveLocationIds({ location_id: 'school', location_ids: ['home', 'camp'] })).toEqual(['school']);
  });

  it('locationFields mirrors one place into location_id and dedupes', () => {
    expect(locationFields([])).toEqual({ location_id: null, location_ids: [] });
    expect(locationFields(['a', 'a'])).toEqual({ location_id: 'a', location_ids: ['a'] });
    expect(locationFields(['a', 'b']).location_id).toBeNull();
  });

  it('filterRewards keeps multi-place rewards for each place, and null asks for every-place rows only', () => {
    const reward = (id: string, loc: { location_id: string | null; location_ids?: string[] | null }) => ({
      id, profile_id: 'p', version: 0, client_updated_at: 0, updated_by: 'u', deleted_at: null, name: id,
      emoji: null, photo_id: null, chip_cost: 1, always_available: false, position: 0, ...loc,
    });
    const rows = [reward('all', { location_id: null, location_ids: [] }), reward('two', locationFields(['home', 'school'])), reward('old', { location_id: 'home' })];
    const ids = (loc: string | null) => filterRewards(rows, { location_id: loc }).map((r) => r.id).sort();
    expect(ids('home')).toEqual(['all', 'old', 'two']);
    expect(ids('school')).toEqual(['all', 'two']);
    expect(ids('camp')).toEqual(['all']);
    expect(ids(null)).toEqual(['all']);
  });
});

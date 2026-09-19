import { describe, expect, it } from 'vitest';
import type { DayPlan } from '@chipperly/shared/schemas/schedule';
import { formatDayMonth, newestDayPlan } from './dayPlans';

function dayPlan(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    id: 'plan-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 1000,
    updated_by: 'user-1',
    deleted_at: null,
    date: '2026-09-19',
    note: 'Grandma is visiting after school.',
    ...overrides,
  };
}

describe('newestDayPlan', () => {
  it('picks the row with the highest client_updated_at', () => {
    const rows = [
      dayPlan({ id: 'a', client_updated_at: 1000, note: 'older' }),
      dayPlan({ id: 'b', client_updated_at: 3000, note: 'newest' }),
      dayPlan({ id: 'c', client_updated_at: 2000, note: 'middle' }),
    ];
    expect(newestDayPlan(rows)?.id).toBe('b');
  });

  it('ignores soft-deleted rows even if they are newer', () => {
    const rows = [
      dayPlan({ id: 'live', client_updated_at: 1000 }),
      dayPlan({ id: 'deleted', client_updated_at: 5000, deleted_at: 5000 }),
    ];
    expect(newestDayPlan(rows)?.id).toBe('live');
  });

  it('is undefined with no rows, or only deleted ones', () => {
    expect(newestDayPlan([])).toBeUndefined();
    expect(newestDayPlan([dayPlan({ deleted_at: 1 })])).toBeUndefined();
  });
});

describe('formatDayMonth', () => {
  it('formats as "day month", no year, no leading zero', () => {
    expect(formatDayMonth('2026-09-19')).toBe('19 September');
    expect(formatDayMonth('2026-01-05')).toBe('5 January');
  });
});

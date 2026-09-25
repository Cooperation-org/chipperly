import { describe, expect, it } from 'vitest';
import type { AttitudeCheck } from '@chipperly/shared/schemas/attitude';
import type { MoodEvent } from '@chipperly/shared/schemas/mood';
import { feelingOf, feelingsByDay } from './feelings';

/** Local noon plus `minutes` on `iso`, so the day grouping holds in any test timezone. */
function at(iso: string, minutes = 0): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, minutes).getTime();
}

function check(overrides: Partial<AttitudeCheck>): AttitudeCheck {
  return {
    id: 'c',
    profile_id: 'p',
    version: 0,
    client_updated_at: 0,
    updated_by: 'u',
    deleted_at: null,
    schedule_item_id: null,
    value: 'good',
    created_at: at('2026-09-24'),
    created_by: 'u',
    ...overrides,
  };
}

function mood(overrides: Partial<MoodEvent>): MoodEvent {
  return {
    id: 'm',
    profile_id: 'p',
    version: 0,
    client_updated_at: 0,
    updated_by: 'u',
    deleted_at: null,
    date: '2026-09-24',
    delta: 1,
    level_after: 1,
    created_at: at('2026-09-24'),
    created_by: 'u',
    ...overrides,
  };
}

describe('feelingOf', () => {
  it('uses the face, and reads old good/grumpy rows as 4 and 2', () => {
    expect(feelingOf({ feeling: 5, value: 'good' })).toBe(5);
    expect(feelingOf({ value: 'good' })).toBe(4);
    expect(feelingOf({ feeling: null, value: 'grumpy' })).toBe(2);
  });
});

describe('feelingsByDay', () => {
  it('merges faces and mood taps per day, newest day first, oldest entry first, with the average and end level', () => {
    const days = feelingsByDay(
      [
        check({ id: 'a', feeling: 2, created_at: at('2026-09-24', 30) }),
        check({ id: 'b', feeling: 5, created_at: at('2026-09-24', 10) }),
        check({ id: 'gone', feeling: 1, deleted_at: 1 }),
        check({ id: 'old', feeling: 4, created_at: at('2026-09-23') }),
      ],
      [mood({ id: 'm1', level_after: 1, created_at: at('2026-09-24', 20) }), mood({ id: 'm2', level_after: 3, created_at: at('2026-09-24', 40) })],
    );

    expect(days.map((d) => d.date)).toEqual(['2026-09-24', '2026-09-23']);
    const [today] = days;
    expect(today?.entries.map((e) => (e.type === 'feeling' ? e.check.id : e.event.id))).toEqual(['b', 'm1', 'a', 'm2']);
    expect(today?.average).toBe(3.5);
    expect(today?.moodLevel).toBe(3);
    expect(days[1]?.moodLevel).toBeNull();
  });
});

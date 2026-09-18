import { describe, expect, it } from 'vitest';
import type { MoodEvent } from '@chipperly/shared/schemas/mood';
import { dayHistory, levelEmoji } from './mood';

function moodEvent(overrides: Partial<MoodEvent> = {}): MoodEvent {
  return {
    id: 'evt-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    date: '2026-09-18',
    delta: 1,
    level_after: 1,
    created_at: 1000,
    created_by: 'user-1',
    ...overrides,
  };
}

describe('levelEmoji', () => {
  it('matches the beta table exactly at each named level', () => {
    expect(levelEmoji(-5)).toBe('😢');
    expect(levelEmoji(-3)).toBe('😟');
    expect(levelEmoji(-1)).toBe('😐');
    expect(levelEmoji(0)).toBe('😐');
    expect(levelEmoji(1)).toBe('🙂');
    expect(levelEmoji(3)).toBe('😊');
    expect(levelEmoji(5)).toBe('😄');
  });

  it('picks the nearest level, and the earlier entry on an exact tie', () => {
    // -4 is equidistant from -5 and -3; the beta's `mi` keeps whichever it
    // finds first walking the table in order, which is -5.
    expect(levelEmoji(-4)).toBe('😢');
    expect(levelEmoji(2)).toBe('🙂');
    expect(levelEmoji(4)).toBe('😊');
  });
});

describe('dayHistory', () => {
  it('groups by day, newest day first, using the newest event as the day level', () => {
    const events: MoodEvent[] = [
      moodEvent({ id: 'a', date: '2026-09-17', delta: 1, level_after: 1, created_at: 1000 }),
      moodEvent({ id: 'b', date: '2026-09-17', delta: 1, level_after: 2, created_at: 2000 }),
      moodEvent({ id: 'c', date: '2026-09-18', delta: -1, level_after: -1, created_at: 3000 }),
    ];

    const days = dayHistory(events);
    expect(days.map((d) => d.date)).toEqual(['2026-09-18', '2026-09-17']);
    expect(days[0]).toMatchObject({ level: -1, emoji: '😐', plus: 0, minus: 1 });
    expect(days[1]).toMatchObject({ level: 2, emoji: '🙂', plus: 2, minus: 0 });
  });

  it('ignores soft-deleted events', () => {
    const events: MoodEvent[] = [
      moodEvent({ id: 'a', deleted_at: 5000 }),
      moodEvent({ id: 'b', delta: -1, level_after: -1, created_at: 500 }),
    ];
    const days = dayHistory(events);
    expect(days).toHaveLength(1);
    expect(days[0]?.level).toBe(-1);
  });

  it('is empty with no events', () => {
    expect(dayHistory([])).toEqual([]);
  });
});

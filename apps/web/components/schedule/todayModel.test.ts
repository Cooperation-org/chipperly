import { describe, expect, it } from 'vitest';
import type { DayItem } from '@/lib/data/schedule';
import { allDone, formatTime, groupByPartOfDay, moveItem, secondaryText, weekdayName } from './todayModel';

function makeDay(overrides: {
  id: string;
  part_of_day?: 'morning' | 'afternoon' | 'evening' | null;
  start_time?: string | null;
  completed_at?: number | null;
  stepCount?: number;
}): DayItem {
  return {
    item: {
      id: overrides.id,
      profile_id: 'p',
      version: 0,
      client_updated_at: 0,
      updated_by: 'u',
      deleted_at: null,
      date: '2026-09-17',
      position: 0,
      activity_id: `a-${overrides.id}`,
      start_time: overrides.start_time ?? null,
      part_of_day: overrides.part_of_day ?? null,
      source: 'manual',
      completed_at: overrides.completed_at ?? null,
      completed_by: null,
    },
    activity: {
      id: `a-${overrides.id}`,
      profile_id: 'p',
      version: 0,
      client_updated_at: 0,
      updated_by: 'u',
      deleted_at: null,
      name: overrides.id,
      emoji: null,
      photo_id: null,
      chip_value: 0,
      location_id: null,
      recurrence: null,
      recurrence_weekday: null,
      recurrence_time: null,
      position: 0,
    },
    steps: Array.from({ length: overrides.stepCount ?? 0 }, (_, i) => ({
      step: {
        id: `s-${overrides.id}-${i}`,
        profile_id: 'p',
        version: 0,
        client_updated_at: 0,
        updated_by: 'u',
        deleted_at: null,
        activity_id: `a-${overrides.id}`,
        position: i,
        name: `step ${i}`,
        emoji: null,
        photo_id: null,
      },
      completed_at: null,
      completed_by: null,
      completion_id: null,
    })),
  };
}

describe('groupByPartOfDay', () => {
  it('returns one ungrouped bucket when nothing has a part of day', () => {
    const items = [makeDay({ id: 'a' }), makeDay({ id: 'b' })];
    expect(groupByPartOfDay(items)).toEqual([{ header: null, items }]);
  });

  it('returns nothing for an empty day', () => {
    expect(groupByPartOfDay([])).toEqual([]);
  });

  it('groups by part of day, ungrouped items first, empty parts omitted', () => {
    const noPart = makeDay({ id: 'wake' });
    const morning = makeDay({ id: 'brush', part_of_day: 'morning' });
    const evening = makeDay({ id: 'bath', part_of_day: 'evening' });
    const groups = groupByPartOfDay([noPart, morning, evening]);
    expect(groups.map((g) => g.header)).toEqual([null, 'MORNING', 'EVENING']);
    expect(groups[0]?.items).toEqual([noPart]);
    expect(groups[1]?.items).toEqual([morning]);
    expect(groups[2]?.items).toEqual([evening]);
  });
});

describe('formatTime', () => {
  it('formats morning and afternoon/evening times, noon and midnight', () => {
    expect(formatTime('08:00')).toBe('8:00 AM');
    expect(formatTime('13:05')).toBe('1:05 PM');
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });
});

describe('secondaryText', () => {
  it('prefers start time over step count', () => {
    expect(secondaryText(makeDay({ id: 'a', start_time: '08:00', stepCount: 3 }))).toBe('8:00 AM');
  });

  it('falls back to "Routine · N steps"', () => {
    expect(secondaryText(makeDay({ id: 'a', stepCount: 1 }))).toBe('Routine · 1 step');
    expect(secondaryText(makeDay({ id: 'a', stepCount: 3 }))).toBe('Routine · 3 steps');
  });

  it('is undefined with neither', () => {
    expect(secondaryText(makeDay({ id: 'a' }))).toBeUndefined();
  });
});

describe('weekdayName', () => {
  it('names the weekday for an isoDate', () => {
    expect(weekdayName('2026-09-17')).toBe('Thursday');
  });
});

describe('allDone', () => {
  it('is false for an empty day', () => {
    expect(allDone([])).toBe(false);
  });

  it('is true only when every item is completed', () => {
    const items = [makeDay({ id: 'a', completed_at: 1 }), makeDay({ id: 'b', completed_at: 2 })];
    expect(allDone(items)).toBe(true);
    expect(allDone([...items, makeDay({ id: 'c' })])).toBe(false);
  });
});

describe('moveItem', () => {
  it('moves an item from one index to another', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('is a no-op when from equals to, and clamps out-of-range targets', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });
});

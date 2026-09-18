import { describe, expect, it } from 'vitest';
import { materializedId, occursOn } from '../src/helpers/recurrence.js';

// 2026-03-01 is a Sunday, 2026-03-02 a Monday, 2026-03-07 a Saturday.
const sunday = '2026-03-01';
const monday = '2026-03-02';
const wednesday = '2026-03-04';
const saturday = '2026-03-07';

describe('occursOn', () => {
  it('is false when recurrence is null', () => {
    expect(occursOn({ recurrence: null, recurrence_weekdays: null }, monday, [])).toBe(false);
  });

  it('daily occurs every day', () => {
    const activity = { recurrence: 'daily' as const, recurrence_weekdays: null };
    expect(occursOn(activity, monday, [])).toBe(true);
    expect(occursOn(activity, saturday, [])).toBe(true);
  });

  it('weekdays occurs Monday through Friday only', () => {
    const activity = { recurrence: 'weekdays' as const, recurrence_weekdays: null };
    expect(occursOn(activity, monday, [])).toBe(true);
    expect(occursOn(activity, saturday, [])).toBe(false);
    expect(occursOn(activity, sunday, [])).toBe(false);
  });

  it('weekends occurs Saturday and Sunday only', () => {
    const activity = { recurrence: 'weekends' as const, recurrence_weekdays: null };
    expect(occursOn(activity, saturday, [])).toBe(true);
    expect(occursOn(activity, sunday, [])).toBe(true);
    expect(occursOn(activity, monday, [])).toBe(false);
  });

  it('weekly occurs only on a listed weekday', () => {
    const activity = { recurrence: 'weekly' as const, recurrence_weekdays: [1] };
    expect(occursOn(activity, monday, [])).toBe(true);
    expect(occursOn(activity, wednesday, [])).toBe(false);
  });

  it('weekly occurs on any of several listed weekdays', () => {
    const activity = { recurrence: 'weekly' as const, recurrence_weekdays: [1, 3] };
    expect(occursOn(activity, monday, [])).toBe(true);
    expect(occursOn(activity, wednesday, [])).toBe(true);
    expect(occursOn(activity, saturday, [])).toBe(false);
  });

  it('weekly with no weekdays set never occurs', () => {
    const activity = { recurrence: 'weekly' as const, recurrence_weekdays: null };
    expect(occursOn(activity, monday, [])).toBe(false);
  });

  it('a skip for the date suppresses the occurrence', () => {
    const activity = { recurrence: 'daily' as const, recurrence_weekdays: null };
    expect(occursOn(activity, monday, [{ date: monday }])).toBe(false);
    expect(occursOn(activity, monday, [{ date: wednesday }])).toBe(true);
  });
});

describe('materializedId', () => {
  it('is deterministic for the same activity and date', () => {
    const a = materializedId('a1111111-1111-1111-1111-111111111111', monday);
    const b = materializedId('a1111111-1111-1111-1111-111111111111', monday);
    expect(a).toBe(b);
  });

  it('differs for a different date', () => {
    const a = materializedId('a1111111-1111-1111-1111-111111111111', monday);
    const b = materializedId('a1111111-1111-1111-1111-111111111111', wednesday);
    expect(a).not.toBe(b);
  });

  it('differs for a different activity', () => {
    const a = materializedId('a1111111-1111-1111-1111-111111111111', monday);
    const b = materializedId('b2222222-2222-2222-2222-222222222222', monday);
    expect(a).not.toBe(b);
  });

  it('produces a valid uuid', () => {
    const id = materializedId('a1111111-1111-1111-1111-111111111111', monday);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

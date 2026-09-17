import { describe, expect, it } from 'vitest';
import { addDays, formatDayLabel, isWeekend, todayIso, weekday } from '../src/helpers/date.js';

describe('todayIso', () => {
  it('uses local date parts, not UTC', () => {
    // 2026-03-01 23:30 local time; toISOString would give 2026-03-02 in a
    // timezone ahead of UTC. Constructing with local components avoids that.
    const now = new Date(2026, 2, 1, 23, 30);
    expect(todayIso(now)).toBe('2026-03-01');
  });

  it('pads single-digit month and day', () => {
    const now = new Date(2026, 0, 5);
    expect(todayIso(now)).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-03-01', 5)).toBe('2026-03-06');
  });

  it('rolls over a month boundary', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('subtracts with a negative n', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('weekday', () => {
  it('returns 0 for a known Sunday', () => {
    expect(weekday('2026-03-01')).toBe(0);
  });

  it('returns 6 for a known Saturday', () => {
    expect(weekday('2026-03-07')).toBe(6);
  });

  it('returns 1 for a known Monday', () => {
    expect(weekday('2026-03-02')).toBe(1);
  });
});

describe('isWeekend', () => {
  it('is true for Saturday and Sunday', () => {
    expect(isWeekend('2026-03-01')).toBe(true);
    expect(isWeekend('2026-03-07')).toBe(true);
  });

  it('is false for a weekday', () => {
    expect(isWeekend('2026-03-02')).toBe(false);
  });
});

describe('formatDayLabel', () => {
  const now = new Date(2026, 2, 15);

  it('labels today', () => {
    expect(formatDayLabel('2026-03-15', now)).toBe('Today');
  });

  it('labels tomorrow', () => {
    expect(formatDayLabel('2026-03-16', now)).toBe('Tomorrow');
  });

  it('labels yesterday', () => {
    expect(formatDayLabel('2026-03-14', now)).toBe('Yesterday');
  });

  it('falls back to a short weekday/month/day label otherwise', () => {
    expect(formatDayLabel('2026-03-20', now)).toBe('Fri, Mar 20');
  });
});

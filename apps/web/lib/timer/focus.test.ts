import { describe, expect, it } from 'vitest';
import { DEFAULT_FOCUS_SETTINGS, intervalMs, isLongBreak, newFocus, nextInterval, sanitizeSettings, focusLabel } from './focus';

describe('focus progression', () => {
  it('starts on focus round 1 at 25 min', () => {
    const f = newFocus();
    expect(f.phase).toBe('focus');
    expect(f.round).toBe(1);
    expect(intervalMs(f)).toBe(25 * 60_000);
  });

  it('goes focus -> short break -> focus round 2', () => {
    const brk = nextInterval(newFocus());
    expect(brk).toMatchObject({ phase: 'break', round: 1 });
    expect(isLongBreak(brk)).toBe(false);
    expect(intervalMs(brk)).toBe(5 * 60_000);
    expect(nextInterval(brk)).toMatchObject({ phase: 'focus', round: 2 });
  });

  it('lands the long break after every 4th round, then keeps counting', () => {
    let f = newFocus();
    const longRounds: number[] = [];
    for (let i = 0; i < 40; i++) {
      if (isLongBreak(f)) longRounds.push(f.round);
      f = nextInterval(f);
    }
    expect(longRounds).toEqual([4, 8, 12, 16, 20]);
    const long = { ...newFocus(), phase: 'break' as const, round: 4 };
    expect(intervalMs(long)).toBe(15 * 60_000);
    expect(nextInterval(long)).toMatchObject({ phase: 'focus', round: 5 });
  });

  it('honours edited settings', () => {
    const s = { focus_min: 10, short_min: 2, long_min: 7, long_every: 2 };
    const f = newFocus(s);
    expect(intervalMs(f)).toBe(600_000);
    const b2 = { ...f, phase: 'break' as const, round: 2 };
    expect(isLongBreak(b2)).toBe(true);
    expect(intervalMs(b2)).toBe(7 * 60_000);
  });

  it('labels the interval and clamps bad settings', () => {
    expect(focusLabel(newFocus())).toBe('Focus, round 1');
    expect(sanitizeSettings({ focus_min: 0, short_min: 999, long_min: NaN, long_every: 1 })).toEqual({
      focus_min: 1,
      short_min: 180,
      long_min: 1,
      long_every: 2,
    });
    expect(sanitizeSettings(DEFAULT_FOCUS_SETTINGS)).toEqual(DEFAULT_FOCUS_SETTINGS);
  });
});

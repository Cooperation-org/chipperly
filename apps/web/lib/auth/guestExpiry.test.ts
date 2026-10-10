import { describe, expect, it } from 'vitest';
import { GUEST_TTL_MS, guestTimeLeftLabel, isGuestEndingSoon, isGuestExpired } from './guestExpiry';

const HOUR = 60 * 60 * 1000;

describe('isGuestExpired', () => {
  it('is false just after the start and just before 48 hours', () => {
    expect(isGuestExpired(1000, 1000)).toBe(false);
    expect(isGuestExpired(1000, 1000 + GUEST_TTL_MS - 1)).toBe(false);
  });

  it('is true at exactly 48 hours and after', () => {
    expect(isGuestExpired(1000, 1000 + GUEST_TTL_MS)).toBe(true);
    expect(isGuestExpired(1000, 1000 + 49 * HOUR)).toBe(true);
  });
});

describe('isGuestEndingSoon', () => {
  it('is false for the first 36 hours and true for the last 12', () => {
    expect(isGuestEndingSoon(0, 0)).toBe(false);
    expect(isGuestEndingSoon(0, 36 * HOUR - 1)).toBe(false);
    expect(isGuestEndingSoon(0, 36 * HOUR)).toBe(true);
    expect(isGuestEndingSoon(0, 47 * HOUR)).toBe(true);
  });
});

describe('guestTimeLeftLabel', () => {
  it('counts hours left, rounded up', () => {
    expect(guestTimeLeftLabel(0, 0)).toBe('48 hours');
    expect(guestTimeLeftLabel(0, 1)).toBe('48 hours');
    expect(guestTimeLeftLabel(0, 25 * HOUR)).toBe('23 hours');
    expect(guestTimeLeftLabel(0, 46 * HOUR + 1)).toBe('2 hours');
  });

  it('says 1 hour, then less than an hour, near the end', () => {
    expect(guestTimeLeftLabel(0, 47 * HOUR)).toBe('1 hour');
    expect(guestTimeLeftLabel(0, 47 * HOUR + 1)).toBe('less than an hour');
    expect(guestTimeLeftLabel(0, 48 * HOUR)).toBe('less than an hour');
  });
});

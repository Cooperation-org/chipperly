import { describe, expect, it } from 'vitest';
import { compUntilAfter, eraseDue } from './person';

const DAY = 24 * 60 * 60 * 1000;

describe('free access dates', () => {
  it('counts from today when there is none or it ran out, and adds to what is still running', () => {
    expect(compUntilAfter(null, 30, 1000)).toBe(1000 + 30 * DAY);
    expect(compUntilAfter(500, 30, 1000)).toBe(1000 + 30 * DAY);
    expect(compUntilAfter(1000 + 10 * DAY, 30, 1000)).toBe(1000 + 40 * DAY);
  });
});

describe('when a closed sign-in may be erased', () => {
  it('is 30 days after it was closed', () => {
    expect(eraseDue(null, 0)).toBeNull();
    expect(eraseDue(1000, 1000 + 29 * DAY)).toEqual({ at: 1000 + 30 * DAY, due: false });
    expect(eraseDue(1000, 1000 + 30 * DAY)).toEqual({ at: 1000 + 30 * DAY, due: true });
  });
});

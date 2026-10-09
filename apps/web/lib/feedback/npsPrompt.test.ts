import { describe, expect, it } from 'vitest';
import { dueNpsMilestone, handledAfter } from './npsPrompt';

const DAY = 86_400_000;

describe('dueNpsMilestone', () => {
  it('waits until the account is 7 days old', () => {
    expect(dueNpsMilestone(0, 6.9 * DAY, [])).toBeNull();
    expect(dueNpsMilestone(0, 7 * DAY, [])).toBe(7);
  });
  it('asks again at 21 days once 7 is handled, and never after both', () => {
    expect(dueNpsMilestone(0, 10 * DAY, [7])).toBeNull();
    expect(dueNpsMilestone(0, 21 * DAY, [7])).toBe(21);
    expect(dueNpsMilestone(0, 90 * DAY, [7, 21])).toBeNull();
  });
  it('asks only the 21 day question of an older account', () => {
    expect(dueNpsMilestone(0, 40 * DAY, [])).toBe(21);
    expect(dueNpsMilestone(0, 40 * DAY, handledAfter(21, []))).toBeNull();
  });
});

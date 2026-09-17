import { describe, expect, it } from 'vitest';
import { nextClientUpdatedAt } from './nextClientUpdatedAt';

describe('nextClientUpdatedAt', () => {
  it('uses now() when there is no existing row (new local row)', () => {
    expect(nextClientUpdatedAt(1000, undefined)).toBe(1000);
  });

  it('uses now() when it is already past the existing row', () => {
    expect(nextClientUpdatedAt(1000, 500)).toBe(1000);
  });

  it('bumps past the existing row when now() would look older (whole-second Date header vs. a precise server timestamp)', () => {
    expect(nextClientUpdatedAt(1000, 1000)).toBe(1001);
    expect(nextClientUpdatedAt(999, 1000)).toBe(1001);
  });
});

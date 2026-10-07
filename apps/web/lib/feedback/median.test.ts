import { describe, expect, it } from 'vitest';
import { median } from './median';

describe('median', () => {
  it('is null with no answers, the middle one for an odd count and the rounded middle pair for an even count', () => {
    expect(median([])).toBeNull();
    expect(median([30, 5, 10])).toBe(10);
    expect(median([5, 10, 12, 30])).toBe(11);
  });
});

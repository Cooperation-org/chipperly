import { describe, expect, it } from 'vitest';
import { moveWithinGroup } from './rewards';

describe('moveWithinGroup', () => {
  it('moves inside the full list', () => {
    expect(moveWithinGroup(['a', 'b', 'c'], ['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveWithinGroup(['a', 'b', 'c'], ['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('keeps rewards outside the group in their slots', () => {
    expect(moveWithinGroup(['a', 'x', 'b', 'y', 'c'], ['a', 'b', 'c'], 2, 0)).toEqual(['c', 'x', 'a', 'y', 'b']);
  });

  it('ignores no-op and out-of-range moves', () => {
    expect(moveWithinGroup(['a', 'b'], ['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveWithinGroup(['a', 'b'], ['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveWithinGroup(['a', 'b'], ['a', 'b'], 0, 9)).toEqual(['b', 'a']);
  });
});

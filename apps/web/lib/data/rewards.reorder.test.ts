import { describe, expect, it } from 'vitest';
import { moveWithinGroup } from './rewards';

describe('moveWithinGroup', () => {
  it('moves inside the full list', () => {
    expect(moveWithinGroup(['a', 'b', 'c'], ['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveWithinGroup(['a', 'b', 'c'], ['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('only moves the one reward, so other groups keep their order', () => {
    // x and y belong to another place; their order against a and b must not change.
    expect(moveWithinGroup(['a', 'x', 'b', 'y', 'c'], ['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'x', 'b', 'y']);
    expect(moveWithinGroup(['a', 'x', 'b', 'y', 'c'], ['a', 'b', 'c'], 0, 1)).toEqual(['x', 'b', 'y', 'a', 'c']);
  });

  it('ignores no-op and out-of-range moves', () => {
    expect(moveWithinGroup(['a', 'b'], ['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveWithinGroup(['a', 'b'], ['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveWithinGroup(['a', 'b'], ['a', 'b'], 0, 9)).toEqual(['b', 'a']);
  });

  describe('with Every place rewards mixed in', () => {
    // e1, e2: Every place. h1, h2, h3: Home. p1: Park.
    const all = ['e1', 'h1', 'p1', 'e2', 'h2', 'h3'];
    const home = ['h1', 'h2', 'h3'];
    const homeMerged = ['e1', 'h1', 'e2', 'h2', 'h3'];

    it('top of the place group is the top of what the child sees there', () => {
      expect(moveWithinGroup(all, home, 2, 0, homeMerged)).toEqual(['h3', 'e1', 'h1', 'p1', 'e2', 'h2']);
    });

    it('bottom of the place group is the bottom of what the child sees there', () => {
      expect(moveWithinGroup(all, home, 0, 2, homeMerged)).toEqual(['e1', 'p1', 'e2', 'h2', 'h3', 'h1']);
    });

    it('a step up also passes the Every place rewards before the reward it jumps', () => {
      const order = ['h1', 'e1', 'h2', 'e2', 'h3'];
      expect(moveWithinGroup(order, home, 2, 1, order)).toEqual(['h1', 'h3', 'e1', 'h2', 'e2']);
    });

    it('a step down also passes the Every place rewards after the reward it jumps', () => {
      const order = ['h1', 'e1', 'h2', 'e2', 'h3'];
      expect(moveWithinGroup(order, home, 0, 1, order)).toEqual(['e1', 'h2', 'e2', 'h1', 'h3']);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { springEasing } from './spring';

const points = (easing: string) => easing.slice(7, -1).split(', ').map(Number);

describe('springEasing', () => {
  it('starts at 0, ends at 1 and settles within a second', () => {
    const { easing, duration } = springEasing();
    const p = points(easing);
    expect(p[0]).toBe(0);
    expect(p.at(-1)).toBe(1);
    expect(duration).toBeGreaterThan(200);
    expect(duration).toBeLessThan(1000);
  });

  it('overshoots by only a few percent (no bounce)', () => {
    expect(Math.max(...points(springEasing().easing))).toBeLessThan(1.04);
  });

  it('a critically damped spring never overshoots', () => {
    expect(Math.max(...points(springEasing({ stiffness: 100, damping: 20 }).easing))).toBeLessThanOrEqual(1);
  });
});

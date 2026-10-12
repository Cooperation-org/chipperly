import { describe, expect, it } from 'vitest';
import { chipLayout } from './chipSize';

function width({ px, gap, cols }: { px: number; gap: number; cols: number }): number {
  return cols * px + (cols - 1) * gap;
}

describe('chipLayout', () => {
  it('defaults to large, the old sizes', () => {
    expect(chipLayout(undefined, 5, 'strip').px).toBe(28);
    expect(chipLayout(undefined, 5, 'board').px).toBe(44);
  });

  it('grows with each step', () => {
    const sizes = ['small', 'medium', 'large', 'xl'] as const;
    const px = sizes.map((s) => chipLayout(s, 5, 'strip').px);
    expect(px).toEqual([...px].sort((a, b) => a - b));
    expect(new Set(px).size).toBe(4);
  });

  it('puts extra large in two even rows', () => {
    expect(chipLayout('xl', 5, 'strip').cols).toBe(3);
    expect(chipLayout('xl', 8, 'board').cols).toBe(4);
    expect(chipLayout('xl', 3, 'strip').cols).toBe(3);
  });

  it('keeps one row when it fits', () => {
    expect(chipLayout('large', 5, 'strip').cols).toBe(5);
    expect(chipLayout('large', 5, 'board').cols).toBe(5);
  });

  it('fits a 320px screen at every size and goal, with no 1-chip last row', () => {
    for (const size of ['small', 'medium', 'large', 'xl'] as const) {
      for (let total = 1; total <= 20; total++) {
        for (const where of ['strip', 'board'] as const) {
          const l = chipLayout(size, total, where);
          expect(width(l)).toBeLessThanOrEqual(where === 'strip' ? 240 : 288);
          const last = total % l.cols || l.cols;
          if (total > l.cols) expect(l.cols - last).toBeLessThan(Math.ceil(total / l.cols));
        }
      }
    }
  });
});

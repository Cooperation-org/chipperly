import { describe, expect, it } from 'vitest';
import { axisLabel, barRects, labelIndexes, lastActiveLabel, linePoints, niceMax, scaleHeight, sortPeople, stackHeights } from './charts';

describe('niceMax', () => {
  it('rounds up to 1, 2, 5, 10 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(5)).toBe(5);
    expect(niceMax(6)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(130)).toBe(200);
  });
});

describe('scaleHeight and barRects', () => {
  it('scales into the height and clamps', () => {
    expect(scaleHeight(5, 10, 100)).toBe(50);
    expect(scaleHeight(20, 10, 100)).toBe(100);
    expect(scaleHeight(-1, 10, 100)).toBe(0);
    expect(scaleHeight(1, 0, 100)).toBe(0);
  });
  it('lays bars across the width, growing from the bottom', () => {
    const bars = barRects([0, 5, 10], 10, 104, 100, 4);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toMatchObject({ x: 0, width: 32, height: 0, y: 100 });
    expect(bars[1]).toMatchObject({ x: 36, height: 50, y: 50 });
    expect(bars[2]).toMatchObject({ x: 72, height: 100, y: 0 });
    expect(barRects([], 1, 100, 100)).toEqual([]);
  });
});

describe('linePoints', () => {
  it('puts a point in the middle of each slot', () => {
    expect(linePoints([0, 10], 10, 100, 50)).toBe('25,50 75,0');
  });
  it('handles one point and none', () => {
    expect(linePoints([5], 10, 100, 100)).toBe('50,50');
    expect(linePoints([], 10, 100, 100)).toBe('');
  });
});

describe('stackHeights', () => {
  it('stacks and never passes the top', () => {
    expect(stackHeights([1, 1, 2], 4, 100)).toEqual([25, 25, 50]);
    const h = stackHeights([5, 5], 5, 100);
    expect(h[0]! + h[1]!).toBeLessThanOrEqual(100);
  });
});

describe('labels', () => {
  it('labels every slot up to the max, else evenly ending on the last', () => {
    expect(labelIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const idx = labelIndexes(30);
    expect(idx.length).toBeLessThanOrEqual(7);
    expect(idx.at(-1)).toBe(29);
  });
  it('names the day by weekday for a week and by number for a month', () => {
    expect(axisLabel('2026-10-13', 7)).toBe('Tue');
    expect(axisLabel('2026-10-13', 30)).toBe('13');
  });
});

describe('sortPeople', () => {
  const rows = [
    { name: 'Cy', tasks_done: 1, chips_earned: 9, last_active: null },
    { name: 'Ana', tasks_done: 5, chips_earned: 2, last_active: 100 },
    { name: 'Bo', tasks_done: 5, chips_earned: 4, last_active: 200 },
  ];
  it('sorts by last active, most recent first, never-active last', () => {
    expect(sortPeople(rows, 'last_active').map((r) => r.name)).toEqual(['Bo', 'Ana', 'Cy']);
  });
  it('sorts numbers high to low with name as tie-break, and names A to Z', () => {
    expect(sortPeople(rows, 'tasks_done').map((r) => r.name)).toEqual(['Ana', 'Bo', 'Cy']);
    expect(sortPeople(rows, 'chips_earned').map((r) => r.name)).toEqual(['Cy', 'Bo', 'Ana']);
    expect(sortPeople(rows, 'name').map((r) => r.name)).toEqual(['Ana', 'Bo', 'Cy']);
  });
});

describe('lastActiveLabel', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  it('says how long ago on the viewer clock', () => {
    expect(lastActiveLabel(null, now, 0)).toBe('Never');
    expect(lastActiveLabel(now - 3600_000, now, 0)).toBe('Today');
    expect(lastActiveLabel(now - 86_400_000, now, 0)).toBe('Yesterday');
    expect(lastActiveLabel(now - 3 * 86_400_000, now, 0)).toBe('3 days ago');
  });
});

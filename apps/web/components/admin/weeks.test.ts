import { describe, expect, it } from 'vitest';
import { weekOverWeek } from './weeks';

describe('weekOverWeek', () => {
  it('sums the last 7 days and the 7 before, and copes with a short series', () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ count: i < 16 ? 0 : i < 23 ? 1 : 2 }));
    expect(weekOverWeek(days)).toEqual({ thisWeek: 14, lastWeek: 7 });
    expect(weekOverWeek([{ count: 3 }])).toEqual({ thisWeek: 3, lastWeek: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { lastMonths } from './months';

describe('lastMonths', () => {
  it('lists 12 months oldest first, ending this month, across a year boundary', () => {
    const months = lastMonths(new Date(Date.UTC(2026, 1, 15)));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-03');
    expect(months[11]).toBe('2026-02');
  });
});

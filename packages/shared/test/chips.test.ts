import { describe, expect, it } from 'vitest';
import { balanceFor } from '../src/helpers/chips.js';

const homeId = 'a1111111-1111-1111-1111-111111111111';
const schoolId = 'b2222222-2222-2222-2222-222222222222';

function row(location_id: string | null, delta: number, deleted_at: number | null = null) {
  return { location_id, delta, deleted_at };
}

describe('balanceFor', () => {
  it('sums deltas scoped to a location', () => {
    const ledger = [row(homeId, 1), row(homeId, 1), row(schoolId, 5)];
    expect(balanceFor(ledger, homeId)).toBe(2);
    expect(balanceFor(ledger, schoolId)).toBe(5);
  });

  it('includes null-location rows in every location balance', () => {
    const ledger = [row(homeId, 1), row(null, 2), row(schoolId, 3)];
    expect(balanceFor(ledger, homeId)).toBe(3);
    expect(balanceFor(ledger, schoolId)).toBe(5);
  });

  it('sums only null-location rows when locationId is null', () => {
    const ledger = [row(homeId, 1), row(null, 2), row(schoolId, 3)];
    expect(balanceFor(ledger, null)).toBe(2);
  });

  it('subtracts negative deltas (redeem, manual adjust)', () => {
    const ledger = [row(homeId, 1), row(homeId, 1), row(homeId, -5)];
    expect(balanceFor(ledger, homeId)).toBe(-3);
  });

  it('excludes soft-deleted rows', () => {
    const ledger = [row(homeId, 1), row(homeId, 4, 1_700_000_000_000)];
    expect(balanceFor(ledger, homeId)).toBe(1);
  });

  it('is zero for an empty ledger', () => {
    expect(balanceFor([], homeId)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { Location } from '@chipperly/shared/schemas/location';
import type { ChipLedger } from '@chipperly/shared/schemas/chips';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { computeRedeemDelta, computeWorkingFor, chipTone, chipTones, chipsEarnedOn } from './chips';

/** Local noon on `iso`, so `todayIso(new Date(ms(iso)))` round-trips regardless of the test runner's timezone/DST. */
function ms(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12).getTime();
}

function ledgerRow(overrides: Partial<ChipLedger> = {}): ChipLedger {
  return {
    id: 'ledger-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    location_id: null,
    delta: 1,
    reason: 'manual',
    ref_id: null,
    created_at: 0,
    created_by: 'user-1',
    mood_level: null,
    ...overrides,
  };
}

function location(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    name: 'Home',
    emoji: null,
    photo_id: null,
    position: 0,
    chip_goal: 5,
    working_for_reward_id: null,
    lat: null,
    lng: null,
    radius_m: null,
    ...overrides,
  };
}

function reward(overrides: Partial<Reward> = {}): Reward {
  return {
    id: 'reward-1',
    profile_id: 'profile-1',
    version: 0,
    client_updated_at: 0,
    updated_by: 'user-1',
    deleted_at: null,
    name: 'Movie',
    emoji: '🎬',
    photo_id: null,
    chip_cost: 8,
    location_id: null,
    always_available: false,
    position: 0,
    ...overrides,
  };
}

describe('computeWorkingFor', () => {
  it('uses the location goal when no reward is chosen', () => {
    expect(computeWorkingFor(3, location({ chip_goal: 5 }), null)).toEqual({ reward: null, goal: 5, filled: 3 });
  });

  it("uses the reward's cost over the location goal once one is chosen", () => {
    const result = computeWorkingFor(3, location({ chip_goal: 5 }), reward({ chip_cost: 8 }));
    expect(result.goal).toBe(8);
    expect(result.reward?.id).toBe('reward-1');
  });

  it('never fills past the goal', () => {
    expect(computeWorkingFor(12, location({ chip_goal: 5 }), null).filled).toBe(5);
  });

  it('is zero goal/filled with nothing chosen and no location', () => {
    expect(computeWorkingFor(0, undefined, null)).toEqual({ reward: null, goal: 0, filled: 0 });
  });
});

describe('computeRedeemDelta', () => {
  it('subtract mode removes just the cost', () => {
    expect(computeRedeemDelta('subtract', 8, 8)).toBe(-8);
    expect(computeRedeemDelta('subtract', 8, 20)).toBe(-8);
  });

  it('reset mode empties the whole balance, cost included', () => {
    expect(computeRedeemDelta('reset', 8, 8)).toBe(-8);
    expect(computeRedeemDelta('reset', 8, 20)).toBe(-20);
  });

  it('reset mode with a balance below the cost still empties to zero, not negative', () => {
    expect(computeRedeemDelta('reset', 8, 3)).toBe(-3);
  });
});

describe('chipTone', () => {
  it('is positive at and above 1, negative at and below -1', () => {
    expect(chipTone(1)).toBe('positive');
    expect(chipTone(5)).toBe('positive');
    expect(chipTone(-1)).toBe('negative');
    expect(chipTone(-5)).toBe('negative');
  });

  it('is neutral at 0, and null with no mood event', () => {
    expect(chipTone(0)).toBe('neutral');
    expect(chipTone(null)).toBeNull();
  });
});

describe('chip_ledger row', () => {
  it('carries mood_level, null or a number', () => {
    const withMood = ledgerRow({ mood_level: 3 });
    const withoutMood = ledgerRow({ mood_level: null });
    expect(withMood.mood_level).toBe(3);
    expect(withoutMood.mood_level).toBeNull();
  });
});

describe('chipTones', () => {
  it('tags each unit of a positive-delta row with that row\'s tone, oldest first', () => {
    const ledger = [
      ledgerRow({ id: 'a', delta: 2, mood_level: 3, created_at: 1000 }),
      ledgerRow({ id: 'b', delta: 1, mood_level: -2, created_at: 2000 }),
    ];
    expect(chipTones(ledger, null, 3)).toEqual(['positive', 'positive', 'negative']);
  });

  it('a later negative delta removes the most recently earned tone first', () => {
    const ledger = [
      ledgerRow({ id: 'a', delta: 2, mood_level: 3, created_at: 1000 }),
      ledgerRow({ id: 'b', delta: 1, mood_level: -2, created_at: 2000 }),
      ledgerRow({ id: 'c', delta: -1, mood_level: null, reason: 'redeem', created_at: 3000 }),
    ];
    expect(chipTones(ledger, null, 2)).toEqual(['positive', 'positive']);
  });

  it('ignores rows for a different location and soft-deleted rows', () => {
    const ledger = [
      ledgerRow({ id: 'a', delta: 1, mood_level: 1, location_id: 'other', created_at: 1000 }),
      ledgerRow({ id: 'b', delta: 1, mood_level: -3, deleted_at: 500, created_at: 2000 }),
      ledgerRow({ id: 'c', delta: 1, mood_level: 0, created_at: 3000 }),
    ];
    expect(chipTones(ledger, 'loc-1', 1)).toEqual(['neutral']);
  });
});

describe('chipsEarnedOn', () => {
  it('sums positive deltas across locations on the given local day only', () => {
    const rows = [
      ledgerRow({ id: 'a', delta: 2, location_id: 'home', created_at: ms('2026-09-19') }),
      ledgerRow({ id: 'b', delta: 1, location_id: 'school', created_at: ms('2026-09-19') }),
      ledgerRow({ id: 'c', delta: 5, location_id: 'home', created_at: ms('2026-09-18') }),
    ];
    expect(chipsEarnedOn(rows, '2026-09-19')).toBe(3);
  });

  it('excludes redeems/subtracts (negative delta) and soft-deleted rows', () => {
    const rows = [
      ledgerRow({ id: 'a', delta: 3, created_at: ms('2026-09-19') }),
      ledgerRow({ id: 'b', delta: -3, reason: 'redeem', created_at: ms('2026-09-19') }),
      ledgerRow({ id: 'c', delta: 4, deleted_at: 1, created_at: ms('2026-09-19') }),
    ];
    expect(chipsEarnedOn(rows, '2026-09-19')).toBe(3);
  });

  it('is zero with no rows on that day', () => {
    expect(chipsEarnedOn([], '2026-09-19')).toBe(0);
  });
});

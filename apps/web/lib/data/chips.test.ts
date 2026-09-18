import { describe, expect, it } from 'vitest';
import type { Location } from '@chipperly/shared/schemas/location';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { computeRedeemDelta, computeWorkingFor } from './chips';

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

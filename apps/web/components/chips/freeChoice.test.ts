import { describe, expect, it } from 'vitest';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { completedActivityIds, freeChoiceState, type FreeChoiceContext } from './freeChoice';

function reward(over: Partial<Reward> = {}): Reward {
  return {
    id: 'r1', profile_id: 'p1', version: 0, client_updated_at: 0, updated_by: 'u', deleted_at: null,
    name: 'Free Choice', emoji: null, photo_id: null, chip_cost: null, location_id: null,
    always_available: true, position: 0, ...over,
  };
}
const ctx = (over: Partial<FreeChoiceContext> = {}): FreeChoiceContext => ({
  balance: 0, doneToday: new Set(), activityNames: new Map([['hw', 'homework']]), ...over,
});

describe('freeChoiceState', () => {
  it('always available is open', () => {
    expect(freeChoiceState(reward(), ctx())).toEqual({ kind: 'open' });
  });
  it('legacy reward with no requirement field is open, even with other tasks done', () => {
    expect(freeChoiceState(reward(), ctx({ doneToday: new Set(['hw']) }))).toEqual({ kind: 'open' });
  });
  it('chip-costed reports how many chips are missing', () => {
    const r = reward({ always_available: false, chip_cost: 5 });
    expect(freeChoiceState(r, ctx({ balance: 2 }))).toEqual({ kind: 'chips', cost: 5, short: 3 });
    expect(freeChoiceState(r, ctx({ balance: 9 }))).toEqual({ kind: 'chips', cost: 5, short: 0 });
  });
  it('gated on an incomplete task is locked with a reason', () => {
    expect(freeChoiceState(reward({ requires_activity_id: 'hw' }), ctx())).toEqual({ kind: 'locked', reason: 'After homework' });
  });
  it('gated on a completed task is open', () => {
    expect(freeChoiceState(reward({ requires_activity_id: 'hw' }), ctx({ doneToday: new Set(['hw']) }))).toEqual({ kind: 'open' });
  });
  it('a requirement on a deleted activity does not lock forever', () => {
    expect(freeChoiceState(reward({ requires_activity_id: 'gone' }), ctx())).toEqual({ kind: 'open' });
  });
});

describe('completedActivityIds', () => {
  it('counts only completed, live items', () => {
    const ids = completedActivityIds([
      { activity_id: 'a', completed_at: 1, deleted_at: null },
      { activity_id: 'b', completed_at: null, deleted_at: null },
      { activity_id: 'c', completed_at: 1, deleted_at: 2 },
    ]);
    expect([...ids]).toEqual(['a']);
  });
});

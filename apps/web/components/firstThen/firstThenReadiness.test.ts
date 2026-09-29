import { describe, expect, it } from 'vitest';
import { firstThenReadiness } from './firstThenReadiness';

const set = (first: string | null, then: string | null) => ({
  first_then_activity_id: first,
  first_then_reward_id: then,
});

describe('firstThenReadiness', () => {
  it('neither set: names both', () => {
    const r = firstThenReadiness(set(null, null));
    expect(r.ready).toBe(false);
    expect(r.missingFirst && r.missingThen).toBe(true);
    expect(r.message).toContain('what comes first');
    expect(r.message).toContain('reward that comes after');
  });

  it('only first set: names the reward', () => {
    const r = firstThenReadiness(set('a', null));
    expect(r).toMatchObject({ ready: false, missingFirst: false, missingThen: true });
    expect(r.message).toContain('Pick the reward that comes after');
    expect(r.message).not.toContain('what comes first');
  });

  it('only then set: names the first', () => {
    const r = firstThenReadiness(set(null, 'r'));
    expect(r).toMatchObject({ ready: false, missingFirst: true, missingThen: false });
    expect(r.message).toContain('Pick what comes first');
    expect(r.message).not.toContain('reward');
  });

  it('both set: ready, no message', () => {
    expect(firstThenReadiness(set('a', 'r'))).toEqual({
      ready: true,
      missingFirst: false,
      missingThen: false,
      message: '',
    });
  });

  it('no profile row counts as neither set', () => {
    expect(firstThenReadiness(undefined).ready).toBe(false);
  });
});

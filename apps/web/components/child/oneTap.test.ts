import { describe, expect, it } from 'vitest';
import { canTickInOneTap } from './oneTap';

const base = { hasSteps: true, done: false, stepsDone: 0, showMarkAllDone: true, routineBonus: false };

describe('canTickInOneTap', () => {
  it('always allows a task without steps, done or not', () => {
    expect(canTickInOneTap({ ...base, hasSteps: false, showMarkAllDone: false })).toBe(true);
    expect(canTickInOneTap({ ...base, hasSteps: false, done: true, showMarkAllDone: false })).toBe(true);
  });

  it('allows a routine when Mark all done is shown', () => {
    expect(canTickInOneTap({ ...base, stepsDone: 2 })).toBe(true);
  });

  it('blocks a routine when Mark all done is hidden and there is no bonus', () => {
    expect(canTickInOneTap({ ...base, showMarkAllDone: false })).toBe(false);
  });

  it('follows the check circle bonus rule when Mark all done is hidden', () => {
    expect(canTickInOneTap({ ...base, showMarkAllDone: false, routineBonus: true })).toBe(true);
    expect(canTickInOneTap({ ...base, showMarkAllDone: false, routineBonus: true, stepsDone: 1 })).toBe(false);
  });

  it('never un-ticks a finished routine', () => {
    expect(canTickInOneTap({ ...base, done: true })).toBe(false);
  });
});

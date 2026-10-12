import { describe, expect, it } from 'vitest';
import { changedFields, isConflict } from './conflict';

const base = { id: 'a', name: 'Swim', deleted_at: null, version: 3, client_updated_at: 10, updated_by: 'u1' };

describe('isConflict', () => {
  it('is not a conflict when there is no local row (an addition)', () => {
    expect(isConflict(undefined, base, true)).toBe(false);
  });
  it('is not a conflict when this device has no unsent change', () => {
    expect(isConflict(base, { ...base, name: 'Run' }, false)).toBe(false);
  });
  it('is not a conflict when only bookkeeping differs', () => {
    expect(isConflict(base, { ...base, version: 4, client_updated_at: 99, updated_by: 'u2' }, true)).toBe(false);
  });
  it('is a conflict when an unsent edit meets a different account copy', () => {
    expect(isConflict({ ...base, name: 'Walk' }, { ...base, name: 'Run' }, true)).toBe(true);
  });
  it('counts a delete on either side as a difference', () => {
    expect(changedFields(base, { ...base, deleted_at: 50 })).toEqual(['deleted_at']);
    expect(isConflict({ ...base, deleted_at: 50 }, base, true)).toBe(true);
  });
});

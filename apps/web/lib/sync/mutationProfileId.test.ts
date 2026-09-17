import { describe, expect, it } from 'vitest';
import { mutationProfileId } from './mutationProfileId';

describe('mutationProfileId', () => {
  it("uses the row's own id for a 'profiles' entry", () => {
    expect(mutationProfileId('profiles', 'profile-1', undefined)).toBe('profile-1');
  });

  it('reads profile_id off the row for every other synced table', () => {
    expect(mutationProfileId('activities', 'activity-1', { profile_id: 'profile-1' })).toBe('profile-1');
  });

  it('is undefined when the row has no profile_id (e.g. a delete with no row)', () => {
    expect(mutationProfileId('activities', 'activity-1', undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { profileIdsToSave } from './roles';

describe('profileIdsToSave', () => {
  it('sends the ticked list when an admin is demoted, even if untouched', () => {
    expect(profileIdsToSave('admin', 'member', [], new Set(['a', 'b']))).toEqual(['a', 'b']);
    expect(profileIdsToSave('admin', 'viewer', [], new Set(['a']))).toEqual(['a']);
  });
  it('sends nothing for a member whose list did not change', () => {
    expect(profileIdsToSave('member', 'viewer', ['a'], new Set(['a']))).toBeUndefined();
  });
  it('sends the list when it changed', () => {
    expect(profileIdsToSave('member', 'member', ['a'], new Set(['a', 'b']))).toEqual(['a', 'b']);
  });
  it('sends nothing when the new role is admin', () => {
    expect(profileIdsToSave('member', 'admin', ['a'], new Set(['b']))).toBeUndefined();
  });
});

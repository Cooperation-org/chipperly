import { describe, expect, it } from 'vitest';
import { missingPersonError, profileIdsToSave } from './roles';

describe('missingPersonError', () => {
  it('asks for a person for Support team and Viewer when none is ticked', () => {
    expect(missingPersonError('member', new Set())).toBe('Pick at least one person they can see.');
    expect(missingPersonError('viewer', new Set())).toBeDefined();
  });
  it('is fine with a person ticked, or for an admin', () => {
    expect(missingPersonError('viewer', new Set(['a']))).toBeUndefined();
    expect(missingPersonError('admin', new Set())).toBeUndefined();
  });
});

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

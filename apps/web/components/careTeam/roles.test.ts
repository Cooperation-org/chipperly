import { describe, expect, it } from 'vitest';
import { groupIdsToSave, missingPersonError, profileIdsToSave, roleItemsFor } from './roles';

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

describe('missingPersonError in an organization', () => {
  it('a ticked group is enough, and the message names groups', () => {
    expect(missingPersonError('member', new Set(), 1, true)).toBeUndefined();
    expect(missingPersonError('moderator', new Set(), 0, true)).toBe('Pick at least one group or person they can see.');
  });
});

describe('groupIdsToSave', () => {
  it('sends the list only when it changed', () => {
    expect(groupIdsToSave('member', ['g1'], new Set(['g1']))).toBeUndefined();
    expect(groupIdsToSave('member', ['g1'], new Set(['g1', 'g2']))).toEqual(['g1', 'g2']);
    expect(groupIdsToSave('member', ['g1'], new Set())).toEqual([]);
  });
  it('sends nothing for an admin', () => {
    expect(groupIdsToSave('admin', ['g1'], new Set(['g2']))).toBeUndefined();
  });
});

describe('roleItemsFor', () => {
  it('shows org names and Moderator in an organization', () => {
    expect(roleItemsFor('agency').map((i) => i.label)).toEqual(['Org admin', 'Moderator', 'Staff', 'Family']);
  });
  it('keeps the old names and no Moderator elsewhere', () => {
    expect(roleItemsFor('household').map((i) => i.label)).toEqual(['Admin', 'Support team', 'Viewer']);
  });
  it('a moderator only picks Staff or Family', () => {
    expect(roleItemsFor('agency', 'moderator').map((i) => i.value)).toEqual(['member', 'viewer']);
  });
});

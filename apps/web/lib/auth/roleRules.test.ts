import { describe, expect, it } from 'vitest';
import type { MeAccount } from '@chipperly/shared/schemas/auth';
import { canEditProfile, canEditRole, canManageMember, groupsToOffer, roleChoices, roleForProfile, roleLabel } from './roleRules';

const acct = (id: string, role: MeAccount['role']): MeAccount =>
  ({ account: { id, kind: 'household', name: 'A', created_at: 0 }, role }) as MeAccount;

const profiles = [
  { id: 'p1', account_id: 'a1' },
  { id: 'p2', account_id: 'a2' },
];

describe('permissions', () => {
  it('only a viewer cannot edit', () => {
    expect(canEditRole('admin')).toBe(true);
    expect(canEditRole('member')).toBe(true);
    expect(canEditRole('viewer')).toBe(false);
    expect(canEditRole(undefined)).toBe(true);
  });

  it('reads the role of the account that owns the profile', () => {
    const accounts = [acct('a1', 'viewer'), acct('a2', 'admin')];
    expect(roleForProfile(accounts, profiles, 'p1')).toBe('viewer');
    expect(roleForProfile(accounts, profiles, 'p2')).toBe('admin');
    expect(canEditProfile(accounts, profiles, 'p1')).toBe(false);
    expect(canEditProfile(accounts, profiles, 'p2')).toBe(true);
  });

  it('an unknown profile is not treated as read only', () => {
    expect(canEditProfile([acct('a1', 'viewer')], profiles, 'nope')).toBe(true);
    expect(canEditProfile([], profiles, undefined)).toBe(true);
  });
});

describe('roleLabel', () => {
  it('keeps the old names outside organizations', () => {
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('member', 'household')).toBe('Support team');
    expect(roleLabel('viewer', 'supported')).toBe('Viewer');
  });
  it('uses org names in an organization, Owner only for the owner', () => {
    expect(roleLabel('admin', 'agency', true)).toBe('Owner');
    expect(roleLabel('admin', 'agency', false)).toBe('Org admin');
    expect(roleLabel('moderator', 'agency')).toBe('Moderator');
    expect(roleLabel('member', 'agency')).toBe('Staff');
    expect(roleLabel('viewer', 'agency')).toBe('Family');
  });
});

describe('roleChoices', () => {
  it('offers Moderator only in organizations', () => {
    expect(roleChoices('household')).toEqual(['admin', 'member', 'viewer']);
    expect(roleChoices('agency')).toEqual(['admin', 'moderator', 'member', 'viewer']);
  });
  it('a moderator can only pick Staff or Family', () => {
    expect(roleChoices('agency', 'moderator')).toEqual(['member', 'viewer']);
  });
});

describe('canManageMember', () => {
  const scope = { groups: new Set(['g1']), profiles: new Set(['p1', 'p2']) };
  it('an admin manages anyone', () => {
    expect(canManageMember({ role: 'admin' }, { role: 'moderator' })).toBe(true);
    expect(canManageMember({ role: 'admin' }, { role: 'admin' })).toBe(true);
  });
  it('staff and family manage nobody', () => {
    expect(canManageMember({ role: 'member' }, { role: 'viewer', cluster_ids: ['g1'] }, scope)).toBe(false);
    expect(canManageMember({ role: 'viewer' }, { role: 'member', cluster_ids: ['g1'] }, scope)).toBe(false);
    expect(canManageMember({ role: undefined }, { role: 'member', cluster_ids: ['g1'] }, scope)).toBe(false);
  });
  it('a moderator manages Staff and Family entirely inside their groups and people', () => {
    expect(canManageMember({ role: 'moderator' }, { role: 'member', cluster_ids: ['g1'] }, scope)).toBe(true);
    expect(canManageMember({ role: 'moderator' }, { role: 'viewer', profile_ids: ['p1'] }, scope)).toBe(true);
  });
  it('offers a moderator only their own groups, an admin all', () => {
    const groups = [{ id: 'g1' }, { id: 'g2' }];
    expect(groupsToOffer('moderator', groups, new Set(['g1']))).toEqual([{ id: 'g1' }]);
    expect(groupsToOffer('admin', groups, new Set())).toEqual(groups);
  });
  it('a moderator never manages admins or moderators', () => {
    expect(canManageMember({ role: 'moderator' }, { role: 'admin', cluster_ids: ['g1'] }, scope)).toBe(false);
    expect(canManageMember({ role: 'moderator' }, { role: 'moderator', cluster_ids: ['g1'] }, scope)).toBe(false);
  });
  it('a moderator does not manage someone partly outside, or with no access yet', () => {
    expect(canManageMember({ role: 'moderator' }, { role: 'member', cluster_ids: ['g1', 'g2'] }, scope)).toBe(false);
    expect(canManageMember({ role: 'moderator' }, { role: 'member', profile_ids: ['p1', 'p9'] }, scope)).toBe(false);
    expect(canManageMember({ role: 'moderator' }, { role: 'member' }, scope)).toBe(false);
  });
});

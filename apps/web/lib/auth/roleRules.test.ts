import { describe, expect, it } from 'vitest';
import type { MeAccount } from '@chipperly/shared/schemas/auth';
import { canEditProfile, canEditRole, roleForProfile } from './roleRules';

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

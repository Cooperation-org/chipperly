import { describe, expect, it } from 'vitest';
import {
  canManageOrg,
  canMovePeople,
  staffNames,
  filterRoster,
  homePath,
  initials,
  isOverSeats,
  needsOnboarding,
  orgErrorMessage,
  pickOrgAccount,
  seatLabel,
  type RosterPerson,
} from './roster';

const p = (name: string, cluster_id: string | null = null, archived_at: number | null = null): RosterPerson => ({
  profile_id: name,
  name,
  emoji: null,
  photo_id: null,
  cluster_id,
  archived_at,
  team: [],
});
const all = [p('Zed', 'a'), p('José', 'b'), p('Amy', null), p('Old', 'a', 5)];

describe('filterRoster', () => {
  it('defaults to active people sorted by name', () => {
    expect(filterRoster(all, { q: '', clusterId: null, status: 'active' }).map((x) => x.name)).toEqual(['Amy', 'José', 'Zed']);
  });
  it('archived and all', () => {
    expect(filterRoster(all, { q: '', clusterId: null, status: 'archived' }).map((x) => x.name)).toEqual(['Old']);
    expect(filterRoster(all, { q: '', clusterId: null, status: 'all' })).toHaveLength(4);
  });
  it('search ignores accents and case', () => {
    expect(filterRoster(all, { q: 'jose', clusterId: null, status: 'active' }).map((x) => x.name)).toEqual(['José']);
  });
  it('group filter, including people without a group', () => {
    expect(filterRoster(all, { q: '', clusterId: 'a', status: 'all' }).map((x) => x.name)).toEqual(['Old', 'Zed']);
    expect(filterRoster(all, { q: '', clusterId: 'none', status: 'active' }).map((x) => x.name)).toEqual(['Amy']);
  });
});

describe('seats', () => {
  it('labels with and without a limit', () => {
    expect(seatLabel({ used: 27, limit: null })).toBe('27 people');
    expect(seatLabel({ used: 27, limit: 25 })).toBe('27 of 25 people');
  });
  it('is over only past a set limit', () => {
    expect(isOverSeats({ used: 27, limit: 25 })).toBe(true);
    expect(isOverSeats({ used: 25, limit: 25 })).toBe(false);
    expect(isOverSeats({ used: 900, limit: null })).toBe(false);
  });
});

describe('org account helpers', () => {
  const accts = [
    { account: { id: '1', kind: 'household' }, role: 'admin' },
    { account: { id: '2', kind: 'agency' }, role: 'member' },
    { account: { id: '3', kind: 'agency' }, role: 'admin' },
  ];
  it('picks the active org, else the first', () => {
    expect(pickOrgAccount(accts, '3')?.account.id).toBe('3');
    expect(pickOrgAccount(accts, '1')?.account.id).toBe('2');
    expect(pickOrgAccount([accts[0]!], '1')).toBeUndefined();
  });
  it('home is the Org home only for orgs', () => {
    expect(homePath(accts)).toBe('/org/');
    expect(homePath([accts[0]!])).toBe('/today/');
  });
  it('an org with no people yet is not sent back to onboarding', () => {
    expect(needsOnboarding([], [])).toBe(true);
    expect(needsOnboarding([accts[0]!], [])).toBe(true);
    expect(needsOnboarding([accts[2]!], [])).toBe(false);
    expect(needsOnboarding([accts[0]!], [{}])).toBe(false);
  });
  it('only admins manage', () => {
    expect(canManageOrg('admin')).toBe(true);
    expect(canManageOrg('member')).toBe(false);
    expect(canManageOrg('viewer')).toBe(false);
    expect(canManageOrg(undefined)).toBe(false);
  });
});

describe('text helpers', () => {
  it('initials', () => {
    expect(initials('ada lovelace byron')).toBe('AL');
    expect(initials('  ')).toBe('?');
  });
  it('error text', () => {
    expect(orgErrorMessage('cluster_not_empty')).toMatch(/Move or archive/);
  });
});

describe('moderators on the org screens', () => {
  it('admins and moderators move people, others do not', () => {
    expect(canMovePeople('admin')).toBe(true);
    expect(canMovePeople('moderator')).toBe(true);
    expect(canMovePeople('member')).toBe(false);
    expect(canMovePeople('viewer')).toBe(false);
    expect(canManageOrg('moderator')).toBe(false);
  });
  it('lists staff names without families', () => {
    const team = [
      { user_id: '1', display_name: 'Sam', role: 'member' },
      { user_id: '2', display_name: 'Pat', role: 'viewer' },
      { user_id: '3', display_name: 'Mo', role: 'moderator' },
    ];
    expect(staffNames(team)).toBe('Sam, Mo');
    expect(staffNames([])).toBe('');
  });
});

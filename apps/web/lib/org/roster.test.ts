import { describe, expect, it } from 'vitest';
import {
  canManageOrg,
  filterRoster,
  homePath,
  initials,
  isOverSeats,
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

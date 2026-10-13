import { describe, expect, it } from 'vitest';
import { staleProfileIds } from './staleProfiles';

const me = { accounts: [{ account: { id: 'a' } }], profiles: [{ id: 'p1' }] };
const local = [
  { id: 'p1', account_id: 'a' },
  { id: 'p2', account_id: 'a' },
  { id: 'p3', account_id: 'other' },
  { id: 'p4', account_id: 'a' },
];

describe('staleProfileIds', () => {
  it('drops profiles /me no longer lists, in known accounts only, and keeps ones with unsent work', () => {
    expect(staleProfileIds(local, me, new Set(['p4']))).toEqual(['p2']);
  });
  it('drops nothing when every local profile is listed', () => {
    expect(staleProfileIds([local[0]!], me, new Set())).toEqual([]);
  });
});

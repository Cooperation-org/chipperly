import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/db', () => ({ db: {}, tableFor: () => ({}) }));
vi.mock('../api/client', () => ({ api: {}, ApiError: class {} }));
vi.mock('../media/upload', () => ({ uploadPending: () => Promise.resolve() }));
vi.mock('../auth/session', () => ({ clearSession: () => Promise.resolve() }));
vi.mock('../data/rewardRequest', () => ({ flushRewardRequests: () => Promise.resolve() }));

import { settledSeqs } from './engine';

describe('settledSeqs', () => {
  it('settles what the push sent, not an edit made while it was in flight', () => {
    // seq 3 and 5 were pushed (5 is the latest sent for this row); 8 was written mid-push.
    expect(settledSeqs([{ seq: 3 }, { seq: 5 }, { seq: 8 }], 5)).toEqual([3, 5]);
  });
  it('settles nothing for a row this push never sent', () => {
    expect(settledSeqs([{ seq: 8 }], undefined)).toEqual([]);
  });
});

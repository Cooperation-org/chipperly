import { describe, expect, it } from 'vitest';
import { isPermanentHttpFailure, rejectionOutcome, shouldReportHealth, unsavedNotice } from './parked';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('rejectionOutcome', () => {
  it('lets the server win a stale write, holds what clears by itself, and keeps the rest as dead', () => {
    expect(rejectionOutcome('stale')).toBe('server_wins');
    expect(rejectionOutcome('locked')).toBe('held');
    expect(rejectionOutcome('lapsed')).toBe('held');
    expect(rejectionOutcome('invalid')).toBe('dead');
    expect(rejectionOutcome('forbidden')).toBe('dead');
    expect(rejectionOutcome('a reason from a newer server')).toBe('dead');
  });
});

describe('isPermanentHttpFailure', () => {
  it('is true only for answers that will not change on a retry', () => {
    expect([400, 403, 413, 422].every(isPermanentHttpFailure)).toBe(true);
    expect([401, 404, 408, 429, 500, 502, 503].some(isPermanentHttpFailure)).toBe(false);
  });
});

describe('unsavedNotice', () => {
  const now = 1_000 * HOUR;
  const quiet = { state: 'synced' as const, pending: 0, oldest_pending_at: null, dead: 0 };

  it('says nothing when all is saved, or when a change is merely on its way', () => {
    expect(unsavedNotice(quiet, now)).toBeNull();
    expect(unsavedNotice({ ...quiet, state: 'pending', pending: 2, oldest_pending_at: now - MIN }, now)).toBeNull();
    expect(unsavedNotice({ ...quiet, state: 'offline', pending: 2, oldest_pending_at: now - 3 * HOUR }, now)).toBeNull();
    expect(unsavedNotice({ ...quiet, state: 'error', pending: 2, oldest_pending_at: now - 5 * MIN }, now)).toBeNull();
  });

  it('speaks up for a write the server will not take, ahead of anything else', () => {
    const notice = unsavedNotice({ state: 'pending', pending: 4, oldest_pending_at: now - 30 * HOUR, dead: 1 }, now);
    expect(notice).toMatchObject({ level: 'dead', count: 1 });
    expect(notice!.message).toBe('1 change made on this device could not be saved to your account. It is still on this device.');
  });

  it('speaks up when the server keeps answering with errors for a quarter of an hour', () => {
    expect(unsavedNotice({ ...quiet, state: 'error', pending: 3, oldest_pending_at: now - 16 * MIN }, now)).toMatchObject({
      level: 'stuck',
      count: 3,
      message: '3 changes on this device have not been saved to your account yet.',
    });
  });

  it('speaks up after a day offline, and says what to do', () => {
    expect(unsavedNotice({ ...quiet, state: 'offline', pending: 1, oldest_pending_at: now - 25 * HOUR }, now)!.message).toBe(
      '1 change on this device has not been saved to your account yet. Connect to the internet to save it.',
    );
  });
});

describe('shouldReportHealth', () => {
  it('reports a change at once and otherwise every half hour', () => {
    expect(shouldReportHealth('0|0|0', null, 0, 1)).toBe(true);
    expect(shouldReportHealth('0|0|0', '0|0|0', 1_000, 1_000 + 5 * MIN)).toBe(false);
    expect(shouldReportHealth('1|0|0', '0|0|0', 1_000, 1_000 + 5 * MIN)).toBe(true);
    expect(shouldReportHealth('0|0|0', '0|0|0', 1_000, 1_000 + 31 * MIN)).toBe(true);
  });
});

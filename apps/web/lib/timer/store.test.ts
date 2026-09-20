import { describe, expect, it, vi } from 'vitest';

// setState() persists to Dexie/IndexedDB on every call (lib/db/kv), unavailable
// in the node test environment; same stub lib/api/client.test.ts uses.
vi.mock('../db/kv', () => ({
  getKv: vi.fn().mockResolvedValue(undefined),
  setKv: vi.fn().mockResolvedValue(undefined),
}));

import { setDuration, setLocked, reset, getTimerSnapshot } from './store';

describe('timer store: locked flag', () => {
  it('reset() clears locked back to false, so the kiosk guard releases when a timer session ends', () => {
    setDuration(60_000);
    setLocked(true);
    expect(getTimerSnapshot().locked).toBe(true);

    reset();

    expect(getTimerSnapshot().locked).toBe(false);
  });
});

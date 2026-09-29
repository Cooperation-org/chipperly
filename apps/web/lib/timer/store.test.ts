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

import { afterEach, beforeEach } from 'vitest';
import { acknowledgeEnd, isEnded, restoreState, start } from './store';
import type { TimerState } from './store';

vi.mock('../sound', () => ({ DEFAULT_TIMER_SOUND: 'timer-done', playTimerDone: vi.fn() }));

describe('timer store: end alert never re-arms', () => {
  let frame: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      frame = cb;
      return 1;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function runToEnd(): void {
    setDuration(5_000);
    start();
    vi.setSystemTime(1_010_000);
    frame?.();
  }

  it('is ended once the countdown finishes, and acknowledgeEnd() clears it for good', () => {
    runToEnd();
    expect(isEnded(getTimerSnapshot())).toBe(true);

    acknowledgeEnd();

    const after = getTimerSnapshot();
    expect(isEnded(after)).toBe(false);
    expect(after.remaining_ms).toBe(5_000);
    expect(after.running).toBe(false);
  });

  it('acknowledgeEnd() leaves a running or idle timer alone', () => {
    setDuration(5_000);
    start();
    acknowledgeEnd();
    expect(getTimerSnapshot().running).toBe(true);
    reset();
  });

  it('a reload after the end does not re-arm it (ended snapshot and expired running snapshot)', () => {
    runToEnd();
    const ended = getTimerSnapshot();
    expect(isEnded(restoreState(ended, 2_000_000))).toBe(false);

    const expired: TimerState = { ...ended, running: true, started_at: 1_000_000, remaining_ms: 1, ended_at: null, locked: true };
    const restored = restoreState(expired, 2_000_000);
    expect(isEnded(restored)).toBe(false);
    expect(restored.running).toBe(false);
    expect(restored.locked).toBe(false);
  });

  it('a still-running snapshot resumes with the time left', () => {
    const running: TimerState = { ...getTimerSnapshot(), total_ms: 60_000, running: true, started_at: 1_000_000, ended_at: null };
    expect(restoreState(running, 1_020_000).remaining_ms).toBe(40_000);
  });
});

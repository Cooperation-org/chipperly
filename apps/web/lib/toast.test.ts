import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentToast, hold, release, toast } from './toastStore';

describe('toast timing', () => {
  afterEach(() => vi.useRealTimers());

  it('hides after its duration, waits while held, and restarts the full duration on release', () => {
    vi.useFakeTimers();
    toast('Saved', { undo: () => undefined });
    vi.advanceTimersByTime(4000);
    hold();
    vi.advanceTimersByTime(60_000);
    expect(currentToast()).not.toBeNull();
    release();
    vi.advanceTimersByTime(4999);
    expect(currentToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
  });
});

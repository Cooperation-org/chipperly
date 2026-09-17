import { describe, expect, it } from 'vitest';
import { now, setServerDate } from './clock';

describe('clock', () => {
  it('now() tracks Date.now() once the offset is reset to ~0', () => {
    setServerDate(new Date().toUTCString());
    const before = Date.now();
    const value = now();
    expect(value).toBeGreaterThanOrEqual(before - 1000);
    expect(value).toBeLessThanOrEqual(before + 1000);
  });

  it('setServerDate shifts now() by the header offset', () => {
    const future = new Date(Date.now() + 60_000);
    setServerDate(future.toUTCString());
    expect(now() - Date.now()).toBeGreaterThan(55_000);
  });

  it('ignores a missing or unparseable header', () => {
    setServerDate(new Date().toUTCString());
    const before = now();
    setServerDate(null);
    setServerDate('not-a-date');
    expect(Math.abs(now() - before)).toBeLessThan(1000);
  });

  it('never goes backward even when the learned offset moves the clock back', () => {
    setServerDate(new Date(Date.now() + 60_000).toUTCString());
    const high = now();
    // A freshly-learned offset that would put the clock behind where it's already been.
    setServerDate(new Date().toUTCString());
    expect(now()).toBeGreaterThan(high);
  });

  it('is strictly increasing across back-to-back calls', () => {
    const a = now();
    const b = now();
    const c = now();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

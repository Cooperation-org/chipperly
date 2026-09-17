import { describe, expect, it } from 'vitest';
import { pwaPrecacheRevision } from './pwaPrecacheRevision';

describe('pwaPrecacheRevision', () => {
  it('uses GIT_SHA when set', () => {
    expect(pwaPrecacheRevision('abc123')).toBe('abc123');
  });

  it('never falls back to a constant when GIT_SHA is unset', () => {
    // A frozen fallback (e.g. 'dev') would make Serwist skip re-fetching the
    // precached HTML shell across deploys.
    const revision = pwaPrecacheRevision(undefined);
    expect(revision).not.toBe('dev');
    expect(Number.isNaN(Number(revision))).toBe(false);
  });
});

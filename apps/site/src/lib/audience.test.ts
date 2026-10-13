import { describe, expect, it, vi } from 'vitest';
import { fetchAppUsers, NOT_CONNECTED, pickAudience, type Recipient } from './audience';

const people: Recipient[] = [
  { email: 'w@example.com', segment: 'waitlist' },
  { email: 'T@example.com', segment: 'trial' },
  { email: 'x@example.com', segment: 'trial_expired' },
  { email: 's@example.com', segment: 'subscribed' },
  { email: 'w@example.com', segment: 'subscribed' },
  { email: 'not an email', segment: 'waitlist' },
];

describe('pickAudience', () => {
  it('everyone: all valid addresses once, lowercased', () => {
    expect(pickAudience('all', people, new Set()).sort()).toEqual(['s@example.com', 't@example.com', 'w@example.com', 'x@example.com']);
  });
  it('one segment only', () => {
    expect(pickAudience('waitlist', people, new Set())).toEqual(['w@example.com']);
    expect(pickAudience('trial_expired', people, new Set())).toEqual(['x@example.com']);
    expect(pickAudience('subscribed', people, new Set()).sort()).toEqual(['s@example.com', 'w@example.com']);
  });
  it('app users only: every app segment, no waitlist', () => {
    expect(pickAudience('app_users', people, new Set()).sort()).toEqual(['s@example.com', 't@example.com', 'w@example.com', 'x@example.com']);
    expect(pickAudience('app_users', people.slice(0, 1), new Set())).toEqual([]);
  });
  it('never includes an unsubscribed address, in any audience', () => {
    const gone = new Set(['w@example.com', 't@example.com']);
    expect(pickAudience('all', people, gone).sort()).toEqual(['s@example.com', 'x@example.com']);
    expect(pickAudience('waitlist', people, gone)).toEqual([]);
  });
});

describe('fetchAppUsers', () => {
  it('says the segment is not connected without a secret, and does not call out', async () => {
    const f = vi.fn();
    await expect(fetchAppUsers('https://app.test', undefined, f)).rejects.toThrow(NOT_CONNECTED);
    expect(f).not.toHaveBeenCalled();
  });
  it('sends the secret header and returns the users', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ users: people.slice(0, 1) })));
    expect(await fetchAppUsers('https://app.test', 'sek', f as never)).toEqual(people.slice(0, 1));
    expect(f).toHaveBeenCalledWith('https://app.test/api/internal/newsletter-audience', { headers: { 'x-newsletter-secret': 'sek' } });
  });
});

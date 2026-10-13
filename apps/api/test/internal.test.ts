import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { env } from '../src/env.js';
import { newsletterSegment } from '../src/lib/newsletterAudience.js';
import { accessInputFor, accessState } from '../src/lib/trial.js';

const secret = 'cron-secret-for-tests-at-least-32-chars';

describe('/api/internal (cron routes)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ env: { ...env, CRON_SECRET: secret } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('404s without the secret, or with a wrong one', async () => {
    const none = await app.inject({ method: 'POST', url: '/api/internal/reminders' });
    const wrong = await app.inject({ method: 'POST', url: '/api/internal/reminders', headers: { 'x-cron-secret': 'x'.repeat(secret.length) } });
    expect(none.statusCode).toBe(404);
    expect(wrong.statusCode).toBe(404);
  });

  it('runs reminders and reports busy with the secret', async () => {
    const headers = { 'x-cron-secret': secret };
    const sent = await app.inject({ method: 'POST', url: '/api/internal/reminders', headers });
    expect(sent.statusCode).toBe(200);
    expect(typeof sent.json().sent).toBe('number');

    const busy = await app.inject({ method: 'GET', url: '/api/internal/busy', headers });
    expect(busy.json()).toEqual({ busy: false });
  });

  it('does not list newsletter users with the cron secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/internal/newsletter-audience', headers: { 'x-cron-secret': secret } });
    expect(res.statusCode).toBe(404);
  });

  it('puts a user in the segment of their best account, and only an admin in expired trials', () => {
    expect(newsletterSegment([{ admin: true, state: 'subscribed' }, { admin: true, state: 'lapsed' }])).toBe('subscribed');
    expect(newsletterSegment([{ admin: true, state: 'lapsed' }])).toBe('trial_expired');
    expect(newsletterSegment([{ admin: true, state: 'lapsed' }, { admin: false, state: 'grace' }])).toBe('trial');
    // An invited teacher in a lapsed household cannot pay, so gets no subscribe offers.
    expect(newsletterSegment([{ admin: false, state: 'lapsed' }])).toBe('trial');
    expect(newsletterSegment([{ admin: false, state: 'open' }])).toBe('trial');
    expect(newsletterSegment([])).toBe('trial');
  });

  it("the account's trial is its owner's: a newly signed-up admin neither restarts nor ends it", () => {
    const DAY = 86_400_000;
    const now = 100 * DAY;
    const old = { id: 'old', email: 'old@example.com', created_at: now - 30 * DAY, trial_ends_at: null };
    const fresh = { id: 'fresh', email: 'new@example.com', created_at: now - 5 * DAY, trial_ends_at: null };
    // An organization can always check out, so this does not depend on price ids in the test env.
    const ownedBy = (owner_user_id: string) => ({ kind: 'agency' as const, comp_until: null, owner_user_id });
    expect(accessState(accessInputFor(ownedBy('old'), [old, fresh], null), now).state).toBe('lapsed');
    expect(accessState(accessInputFor(ownedBy('fresh'), [old, fresh], null), now).state).toBe('trial');
    // An owner who is no longer an admin: the latest admin trial, as before.
    expect(accessState(accessInputFor(ownedBy('gone'), [old, fresh], null), now).state).toBe('trial');
  });

  it('lists newsletter users with NEWSLETTER_API_SECRET alone, and leaves the cron routes off', async () => {
    const newsletterSecret = 'newsletter-secret-for-tests-at-least-32';
    const site = await buildApp({ env: { ...env, CRON_SECRET: undefined, NEWSLETTER_API_SECRET: newsletterSecret } });
    const none = await site.inject({ method: 'GET', url: '/api/internal/newsletter-audience' });
    const ok = await site.inject({ method: 'GET', url: '/api/internal/newsletter-audience', headers: { 'x-newsletter-secret': newsletterSecret } });
    const cron = await site.inject({ method: 'POST', url: '/api/internal/reminders', headers: { 'x-cron-secret': newsletterSecret } });
    await site.close();
    expect(none.statusCode).toBe(404);
    expect(ok.statusCode).toBe(200);
    expect(Array.isArray(ok.json().users)).toBe(true);
    expect(cron.statusCode).toBe(404);
  });

  it('is not registered at all without CRON_SECRET', async () => {
    const plain = await buildApp({ env: { ...env, CRON_SECRET: undefined } });
    const res = await plain.inject({ method: 'GET', url: '/api/internal/busy', headers: { 'x-cron-secret': secret } });
    expect(res.statusCode).toBe(404);
    await plain.close();
  });
});

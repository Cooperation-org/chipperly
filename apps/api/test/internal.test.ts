import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { env } from '../src/env.js';
import { newsletterSegment } from '../src/lib/newsletterAudience.js';

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

  it('lists newsletter users only with the secret', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/internal/newsletter-audience' });
    expect(none.statusCode).toBe(404);
    const ok = await app.inject({ method: 'GET', url: '/api/internal/newsletter-audience', headers: { 'x-cron-secret': secret } });
    expect(ok.statusCode).toBe(200);
    expect(Array.isArray(ok.json().users)).toBe(true);
  });

  it('puts a user in trial, expired trial or subscribed', () => {
    const DAY = 86_400_000;
    const now = 100 * DAY;
    expect(newsletterSegment({ created_at: now - 5 * DAY, trial_ends_at: null }, false, now)).toBe('trial');
    expect(newsletterSegment({ created_at: now - 40 * DAY, trial_ends_at: null }, false, now)).toBe('trial_expired');
    expect(newsletterSegment({ created_at: now - 40 * DAY, trial_ends_at: now + DAY }, false, now)).toBe('trial');
    expect(newsletterSegment({ created_at: now - 40 * DAY, trial_ends_at: null }, true, now)).toBe('subscribed');
  });

  it('is not registered at all without CRON_SECRET', async () => {
    const plain = await buildApp({ env: { ...env, CRON_SECRET: undefined } });
    const res = await plain.inject({ method: 'GET', url: '/api/internal/busy', headers: { 'x-cron-secret': secret } });
    expect(res.statusCode).toBe(404);
    await plain.close();
  });
});

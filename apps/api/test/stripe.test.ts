import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { AccountKind } from '@chipperly/shared/schemas/account';
import { PROFILE_LIMITS } from '@chipperly/shared/constants/limits';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { stripe_events, subscriptions } from '../src/db/schema/subscriptions.js';
import { env } from '../src/env.js';
import { applyStripeEvent, priceIdForKind, verifyStripeSignature, type StripeEvent } from '../src/lib/stripe.js';

const SECRET = 'whsec_test_secret';
const NOW = 1_800_000_000_000;

function sign(body: string, secret = SECRET, tSec = NOW / 1000): string {
  const v1 = createHmac('sha256', secret).update(`${tSec}.${body}`).digest('hex');
  return `t=${tSec},v1=${v1}`;
}

describe('verifyStripeSignature', () => {
  const body = '{"id":"evt_1"}';

  it('accepts a correct signature', () => {
    expect(verifyStripeSignature(body, sign(body), SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(Buffer.from(body), sign(body), SECRET, NOW)).toBe(true);
  });

  it('accepts when any one of several v1 values matches', () => {
    const good = sign(body);
    expect(verifyStripeSignature(body, `${good},v1=${'0'.repeat(64)}`, SECRET, NOW)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and a missing or malformed header', () => {
    expect(verifyStripeSignature(`${body} `, sign(body), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, 'other'), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, 'garbage', SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${NOW / 1000}`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${NOW / 1000},v1=nothex`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${NOW / 1000},v1=abcd`, SECRET, NOW)).toBe(false);
  });

  it('rejects a timestamp outside the tolerance in either direction, and accepts the edge', () => {
    const old = sign(body, SECRET, NOW / 1000 - 301);
    const future = sign(body, SECRET, NOW / 1000 + 301);
    const edge = sign(body, SECRET, NOW / 1000 - 300);
    expect(verifyStripeSignature(body, old, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, future, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, edge, SECRET, NOW)).toBe(true);
  });

  it('rejects a valid signature whose timestamp was swapped', () => {
    const v1 = sign(body).split(',')[1];
    expect(verifyStripeSignature(body, `t=${NOW / 1000 - 10},${v1}`, SECRET, NOW)).toBe(false);
  });
});

interface EventOptions {
  id?: string;
  created?: number;
  status?: string;
  type?: string;
  metadata?: object;
}

function subEvent(accountId: string, o: EventOptions = {}): StripeEvent {
  return {
    id: o.id ?? `evt_${uuidv7()}`,
    type: o.type ?? 'customer.subscription.updated',
    created: o.created ?? 1_800_000_000,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: o.status ?? 'active',
        cancel_at_period_end: false,
        current_period_end: 1_802_000_000,
        metadata: o.metadata ?? { account_id: accountId },
      },
    },
  };
}

async function rowFor(accountId: string) {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.account_id, accountId));
  return rows[0];
}

describe('applyStripeEvent idempotency', () => {
  it('applies an event once and treats a redelivery as a duplicate', async () => {
    const accountId = uuidv7();
    const event = subEvent(accountId);
    expect(await applyStripeEvent(event)).toBe('applied');
    expect(await applyStripeEvent(event)).toBe('duplicate');
    const row = await rowFor(accountId);
    expect(row?.status).toBe('active');
    expect(row?.current_period_end).toBe(1_802_000_000_000);
    const marks = await db.select().from(stripe_events).where(eq(stripe_events.id, event.id));
    expect(marks).toHaveLength(1);
  });

  it('a duplicate id does not overwrite newer state', async () => {
    const accountId = uuidv7();
    const first = subEvent(accountId, { status: 'active' });
    await applyStripeEvent(first);
    await applyStripeEvent(subEvent(accountId, { status: 'canceled', created: first.created + 10 }));
    expect(await applyStripeEvent(first)).toBe('duplicate');
    expect((await rowFor(accountId))?.status).toBe('canceled');
  });

  it('drops a different event that is older than the stored state', async () => {
    const accountId = uuidv7();
    await applyStripeEvent(subEvent(accountId, { status: 'canceled', created: 1_800_000_100 }));
    await applyStripeEvent(subEvent(accountId, { status: 'active', created: 1_800_000_000 }));
    expect((await rowFor(accountId))?.status).toBe('canceled');
  });

  it('ignores other event types and subscriptions with no account metadata', async () => {
    const accountId = uuidv7();
    expect(await applyStripeEvent(subEvent(accountId, { type: 'invoice.paid' }))).toBe('ignored');
    expect(await applyStripeEvent(subEvent(accountId, { metadata: {} }))).toBe('ignored');
    expect(await rowFor(accountId)).toBeUndefined();
  });
});

describe('account kind and price mapping', () => {
  it('has a supported kind limited to one person, others unchanged', () => {
    expect(AccountKind.parse('supported')).toBe('supported');
    expect(PROFILE_LIMITS.supported).toBe(1);
    expect(PROFILE_LIMITS.individual).toBe(1);
    expect(PROFILE_LIMITS.household).toBe(8);
    expect(PROFILE_LIMITS.agency).toBe(Infinity);
    expect(AccountKind.safeParse('nope').success).toBe(false);
  });

  it('reads one price id per kind from env, undefined when unset', () => {
    const savedSupported = env.STRIPE_PRICE_SUPPORTED;
    const savedHousehold = env.STRIPE_PRICE_HOUSEHOLD;
    try {
      env.STRIPE_PRICE_SUPPORTED = 'price_s';
      env.STRIPE_PRICE_HOUSEHOLD = undefined;
      expect(priceIdForKind('supported')).toBe('price_s');
      expect(priceIdForKind('household')).toBeUndefined();
    } finally {
      env.STRIPE_PRICE_SUPPORTED = savedSupported;
      env.STRIPE_PRICE_HOUSEHOLD = savedHousehold;
    }
  });
});

describe('billing routes gate and webhook', () => {
  let app: FastifyInstance;
  const saved = { enabled: env.stripeEnabled, secret: env.STRIPE_WEBHOOK_SECRET };
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    env.stripeEnabled = saved.enabled;
    env.STRIPE_WEBHOOK_SECRET = saved.secret;
    await app.close();
  });

  const post = (body: string, signature?: string) =>
    request(app, {
      method: 'POST',
      url: `${env.BASE_PATH}/api/billing/webhook`,
      headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
      payload: body,
    });

  it('404s with keys unset', async () => {
    env.stripeEnabled = false;
    expect((await post('{}')).statusCode).toBe(404);
    expect((await request(app, { method: 'GET', url: `${env.BASE_PATH}/api/billing` })).statusCode).toBe(404);
  });

  it('rejects a bad signature, then applies a signed event once', async () => {
    env.stripeEnabled = true;
    env.STRIPE_WEBHOOK_SECRET = SECRET;
    const accountId = uuidv7();
    const body = JSON.stringify(subEvent(accountId));
    const t = Math.floor(Date.now() / 1000);

    expect((await post(body)).statusCode).toBe(400);
    expect((await post(body, sign(body, 'wrong', t))).statusCode).toBe(400);
    expect(await rowFor(accountId)).toBeUndefined();

    const good = sign(body, SECRET, t);
    expect((await post(body, good)).json()).toMatchObject({ received: true, result: 'applied' });
    expect((await post(body, good)).json()).toMatchObject({ received: true, result: 'duplicate' });
  });
});

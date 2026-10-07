import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { GRACE_DAYS, TRIAL_DAYS } from '@chipperly/shared/schemas/billing';
import { AccountKind } from '@chipperly/shared/schemas/account';
import { PROFILE_LIMITS } from '@chipperly/shared/constants/limits';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { stripe_events, subscriptions } from '../src/db/schema/subscriptions.js';
import { env } from '../src/env.js';
import { promo_codes, users } from '../src/db/schema/accounts.js';
import {
  applyStripeEvent,
  subscriptionNotice,
  couponIdFor,
  discountApplies,
  ensureCoupon,
  loadPersonalDiscount,
  priceIdForKind,
  StripeApiError,
  verifyStripeSignature,
  type StripeEvent,
} from '../src/lib/stripe.js';
import { accessState, accountAccess, assertCanCreate, isPausedCreation, trialEndsAt, writePausedForProfile, type AccessInput } from '../src/lib/trial.js';
import { AppError } from '../src/plugins/errors.js';
import { addMember, createAccount, createProfile, createUser } from './fixtures.js';

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

const DAY = 24 * 60 * 60 * 1000;

describe('accessState: what happens when a trial ends', () => {
  const trialEnd = 1_800_000_000_000;
  const paying: AccessInput = { billingOn: true, canCheckout: true, exempt: false, trialEnd, sub: null };
  const grace = GRACE_DAYS * DAY;

  it('with Stripe unset nothing ever locks, however old the trial', () => {
    const off = { ...paying, billingOn: false };
    expect(accessState(off, trialEnd + 3650 * DAY)).toMatchObject({ state: 'open', write_paused: false });
  });

  it('a kind with no price to pay never locks, and neither does a super admin account', () => {
    expect(accessState({ ...paying, canCheckout: false }, trialEnd + 999 * DAY).write_paused).toBe(false);
    expect(accessState({ ...paying, exempt: true }, trialEnd + 999 * DAY).write_paused).toBe(false);
  });

  it('trial-end boundary: trial until the end, then a full grace week, then paused', () => {
    expect(accessState(paying, trialEnd - 1).state).toBe('trial');
    expect(accessState(paying, trialEnd).state).toBe('grace');
    expect(accessState(paying, trialEnd + grace - 1)).toMatchObject({ state: 'grace', write_paused: false });
    expect(accessState(paying, trialEnd + grace)).toMatchObject({ state: 'lapsed', write_paused: true, pauses_at: trialEnd + grace });
  });

  it('a live subscription never lapses, including past_due while Stripe retries the card', () => {
    for (const status of ['active', 'trialing', 'past_due'] as const) {
      const sub = { status, current_period_end: trialEnd };
      expect(accessState({ ...paying, sub }, trialEnd + 400 * DAY)).toMatchObject({ state: 'subscribed', write_paused: false });
    }
  });

  it('a cancelled subscription keeps the paid period plus the grace week', () => {
    const periodEnd = trialEnd + 100 * DAY;
    const sub = { status: 'canceled' as const, current_period_end: periodEnd };
    expect(accessState({ ...paying, sub }, periodEnd - 1).state).toBe('trial');
    expect(accessState({ ...paying, sub }, periodEnd + grace - 1).write_paused).toBe(false);
    expect(accessState({ ...paying, sub }, periodEnd + grace).write_paused).toBe(true);
  });

  it('the trial length still comes from sign-up unless extended', () => {
    expect(trialEndsAt({ created_at: 1000, trial_ends_at: null })).toBe(1000 + TRIAL_DAYS * DAY);
    expect(trialEndsAt({ created_at: 1000, trial_ends_at: 5 })).toBe(5);
  });
});

describe('isPausedCreation: only new caregiver content pauses', () => {
  const up = (table: string, row: { source?: unknown } | null = {}) => ({ table, op: 'upsert' as const, row });

  it('pauses new caregiver-authored rows', () => {
    for (const t of ['activities', 'activity_steps', 'rewards', 'locations', 'social_stories', 'story_pages', 'day_plans', 'day_events']) {
      expect(isPausedCreation(up(t), false)).toBe(true);
    }
    expect(isPausedCreation(up('schedule_items', { source: 'manual' }), false)).toBe(true);
  });

  it('never pauses edits, deletes, completions, the child log, or the recurring routine a device builds itself', () => {
    expect(isPausedCreation(up('activities'), true)).toBe(false);
    expect(isPausedCreation({ table: 'activities', op: 'delete' }, false)).toBe(false);
    expect(isPausedCreation(up('schedule_items', { source: 'recurring' }), false)).toBe(false);
    expect(isPausedCreation(up('schedule_items', { source: 'manual' }), true)).toBe(false);
    for (const t of ['step_completions', 'chip_ledger', 'attitude_checks', 'mood_events', 'recurrence_skips', 'profiles']) {
      expect(isPausedCreation(up(t), false)).toBe(false);
    }
  });
});

describe('a lapsed account against the real database', () => {
  const saved = { enabled: env.stripeEnabled, price: env.STRIPE_PRICE_HOUSEHOLD };
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    env.stripeEnabled = saved.enabled;
    env.STRIPE_PRICE_HOUSEHOLD = saved.price;
    await app.close();
  });

  /** An account whose only admin signed up long ago, so the trial and the grace week are over. */
  async function lapsedAccount() {
    const admin = await createUser();
    await db.update(users).set({ created_at: Date.now() - (TRIAL_DAYS + GRACE_DAYS + 30) * DAY }).where(eq(users.id, admin.id));
    const accountId = await createAccount(admin.id, 'household');
    await addMember(accountId, admin.id, 'admin');
    const profileId = await createProfile(accountId, admin.id);
    return { admin, accountId, profileId };
  }

  it('with Stripe unset an ancient trial changes nothing', async () => {
    env.stripeEnabled = false;
    env.STRIPE_PRICE_HOUSEHOLD = 'price_h';
    const { accountId, profileId } = await lapsedAccount();
    expect(await accountAccess(accountId)).toMatchObject({ state: 'open', write_paused: false });
    await expect(assertCanCreate(accountId)).resolves.toBeUndefined();
    expect(await writePausedForProfile(profileId)).toBe(false);
  });

  it('with Stripe on but no price for the kind, nothing locks', async () => {
    env.stripeEnabled = true;
    env.STRIPE_PRICE_HOUSEHOLD = undefined;
    const { accountId } = await lapsedAccount();
    expect((await accountAccess(accountId)).write_paused).toBe(false);
  });

  it('blocks creation with 402 but still reads and exports', async () => {
    env.stripeEnabled = true;
    env.STRIPE_PRICE_HOUSEHOLD = 'price_h';
    const { admin, accountId, profileId } = await lapsedAccount();
    expect(await accountAccess(accountId)).toMatchObject({ state: 'lapsed', write_paused: true });
    expect(await writePausedForProfile(profileId)).toBe(true);
    await expect(assertCanCreate(accountId)).rejects.toMatchObject({ status: 402, code: 'subscription_lapsed' });
    await expect(assertCanCreate(accountId)).rejects.toBeInstanceOf(AppError);

    const headers = { authorization: `Bearer ${admin.token}`, 'x-account-id': accountId };
    const exported = await request(app, { method: 'GET', url: `${env.BASE_PATH}/api/me/export`, headers });
    expect(exported.statusCode).toBe(200);
    const me = await request(app, { method: 'GET', url: `${env.BASE_PATH}/api/me`, headers });
    expect(me.statusCode).toBe(200);
  });

  it('one admin still inside their trial keeps the account open, and a live subscription does too', async () => {
    env.stripeEnabled = true;
    env.STRIPE_PRICE_HOUSEHOLD = 'price_h';
    const { accountId } = await lapsedAccount();
    const fresh = await createUser();
    await addMember(accountId, fresh.id, 'admin');
    expect((await accountAccess(accountId)).state).toBe('trial');

    const second = await lapsedAccount();
    await applyStripeEvent(subEvent(second.accountId, { status: 'active' }));
    expect((await accountAccess(second.accountId)).state).toBe('subscribed');
  });
});

describe('promo codes become Stripe coupons', () => {
  type Call = Parameters<typeof ensureCoupon>[1];

  function fakeStripe(existing: Set<string>) {
    const calls: Array<{ method: string; path: string; params: Record<string, string | undefined> }> = [];
    const call: Call = async (method, path, schema, params = {}) => {
      calls.push({ method, path, params });
      if (method === 'GET') {
        const id = decodeURIComponent(path.split('/').pop() ?? '');
        if (!existing.has(id)) throw new StripeApiError(404);
        return schema.parse({ id });
      }
      existing.add(params.id ?? '');
      return schema.parse({ id: params.id });
    };
    return { call, calls };
  }

  it('creates the coupon on first use from the percentage it is given, and reuses it after', async () => {
    const stripe = fakeStripe(new Set());
    const id = await ensureCoupon(30, stripe.call);
    expect(id).toBe(couponIdFor(30));
    const create = stripe.calls.find((c) => c.method === 'POST');
    expect(create?.path).toBe('/coupons');
    expect(create?.params).toMatchObject({ id, percent_off: '30', duration: 'repeating', duration_in_months: '12' });
    expect(await ensureCoupon(30, stripe.call)).toBe(id);
    expect(stripe.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(couponIdFor(30)).not.toBe(couponIdFor(35));
  });

  it('survives losing a creation race, and surfaces a real Stripe failure', async () => {
    let gets = 0;
    const raced: Call = async (method, _path, schema) => {
      if (method === 'GET') {
        gets += 1;
        if (gets === 1) throw new StripeApiError(404);
        return schema.parse({ id: 'x' });
      }
      throw new StripeApiError(400);
    };
    await expect(ensureCoupon(20, raced)).resolves.toBe(couponIdFor(20));

    const down: Call = async () => {
      throw new StripeApiError(500);
    };
    await expect(ensureCoupon(20, down)).rejects.toBeInstanceOf(StripeApiError);
  });

  it('respects applies_to: annual needs a yearly price, any takes whatever', () => {
    expect(discountApplies({ applies_to: 'annual' }, 'year')).toBe(true);
    expect(discountApplies({ applies_to: 'annual' }, 'month')).toBe(false);
    expect(discountApplies({ applies_to: 'annual' }, null)).toBe(false);
    expect(discountApplies({ applies_to: 'any' }, 'month')).toBe(true);
    expect(discountApplies({ applies_to: 'any' }, null)).toBe(true);
  });

  it('loads the own code and offer of a person, and ignores inactive or undecided offers', async () => {
    const offer = `TEST-${uuidv7().slice(-8)}`;
    const now = Date.now();
    await db.insert(promo_codes).values({ code: offer, percent_off: 40, applies_to: 'annual', valid_from: now, valid_until: now, active: true, auto_issue: false, note: null, created_at: now });
    const user = await createUser();
    expect(await loadPersonalDiscount(user.id)).toBeNull();
    const personal = `EARLY-${uuidv7().slice(-6).toUpperCase()}`;
    await db.update(users).set({ promo_code: offer, personal_code: personal, promo_code_at: now }).where(eq(users.id, user.id));
    expect(await loadPersonalDiscount(user.id)).toEqual({ code: personal, percent_off: 40, applies_to: 'annual' });

    await db.update(promo_codes).set({ active: false }).where(eq(promo_codes.code, offer));
    expect(await loadPersonalDiscount(user.id)).toBeNull();
    await db.update(promo_codes).set({ active: true, percent_off: null }).where(eq(promo_codes.code, offer));
    expect(await loadPersonalDiscount(user.id)).toBeNull();
  });
});

describe('subscriptionNotice', () => {
  const s = (status: string, cancel = false) => ({ status, cancel_at_period_end: cancel });
  it('picks the email for each change and stays quiet otherwise', () => {
    expect(subscriptionNotice(undefined, s('active'))).toBe('started');
    expect(subscriptionNotice(s('active'), s('active', true))).toBe('cancel_scheduled');
    expect(subscriptionNotice(s('active', true), s('active', true))).toBeNull();
    expect(subscriptionNotice(s('active'), s('past_due'))).toBe('payment_failed');
    expect(subscriptionNotice(s('past_due'), s('past_due'))).toBeNull();
    expect(subscriptionNotice(s('active', true), s('canceled'))).toBe('ended');
    expect(subscriptionNotice(s('past_due'), s('active'))).toBe('started');
  });
});

describe('accessState: a failed first payment', () => {
  it('does not extend the trial', () => {
    const trialEnd = Date.UTC(2026, 9, 28);
    const input = { billingOn: true, canCheckout: true, exempt: false, trialEnd, sub: { status: 'incomplete', current_period_end: trialEnd + 10 * 24 * 60 * 60 * 1000 } } as const;
    expect(accessState(input, trialEnd + 8 * 24 * 60 * 60 * 1000)).toMatchObject({ state: 'lapsed', ended_at: trialEnd });
  });
});

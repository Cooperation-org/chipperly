import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { AccountKind } from '@chipperly/shared/schemas/account';
import { SubscriptionStatus } from '@chipperly/shared/schemas/billing';
import { db } from '../db/client.js';
import { promo_codes, users } from '../db/schema/accounts.js';
import { stripe_events, subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { AppError } from '../plugins/errors.js';

// No Stripe SDK on purpose (keeps the lockfile clean): REST via fetch, webhook
// signature via node:crypto.

const STRIPE_API = 'https://api.stripe.com/v1';
export const SIGNATURE_TOLERANCE_SEC = 300;

/**
 * Verifies a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=<hex>...]`):
 * HMAC-SHA256 of `${t}.${rawBody}` under the endpoint secret, compared in
 * constant time against every v1 value, and `t` within the tolerance so a
 * captured payload cannot be replayed later. `rawBody` must be the exact bytes
 * Stripe sent, not re-serialised JSON.
 */
export function verifyStripeSignature(
  rawBody: string | Buffer,
  header: string | undefined,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSec: number = SIGNATURE_TOLERANCE_SEC,
): boolean {
  if (!header) return false;
  let timestamp = '';
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') candidates.push(value);
  }
  if (!/^\d+$/.test(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSec) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return candidates.some((hex) => {
    if (!/^[0-9a-f]+$/i.test(hex)) return false;
    const given = Buffer.from(hex, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The env price id for an account kind; undefined = the owner has not set one, so that kind cannot check out. */
export function priceIdForKind(kind: AccountKind): string | undefined {
  const byKind: Record<AccountKind, string | undefined> = {
    individual: env.STRIPE_PRICE_INDIVIDUAL,
    household: env.STRIPE_PRICE_HOUSEHOLD,
    agency: env.STRIPE_PRICE_AGENCY,
    supported: env.STRIPE_PRICE_SUPPORTED,
  };
  return byKind[kind];
}

/** Stripe wants form encoding with bracketed keys, e.g. `line_items[0][price]`. */
export function stripeForm(params: Record<string, string | undefined>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) form.set(key, value);
  return form;
}

/** A non-2xx from Stripe; `stripeStatus` lets a caller tell "does not exist" (404) from a real failure. */
export class StripeApiError extends AppError {
  readonly stripeStatus: number;
  constructor(stripeStatus: number) {
    super(502, 'stripe_error', `Stripe returned ${stripeStatus}`);
    this.stripeStatus = stripeStatus;
  }
}

export async function stripeRequest<S extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  schema: S,
  params: Record<string, string | undefined> = {},
): Promise<z.infer<S>> {
  if (!env.STRIPE_SECRET_KEY) throw new AppError(404, 'not_found', 'Billing is not enabled');
  const form = stripeForm(params);
  const res = await fetch(`${STRIPE_API}${path}${method === 'GET' && form.size ? `?${form}` : ''}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? form : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new StripeApiError(res.status);
  return schema.parse(await res.json());
}

// ---- webhook events ----

const EventSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  /** Unix seconds. */
  created: z.number().int(),
  data: z.object({ object: z.unknown() }),
});
export type StripeEvent = z.infer<typeof EventSchema>;
export const parseStripeEvent = (raw: unknown): StripeEvent => EventSchema.parse(raw);

const SubscriptionObjectSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: SubscriptionStatus,
  cancel_at_period_end: z.boolean().default(false),
  // Older API versions put the period on the subscription, newer ones on its items.
  current_period_end: z.number().int().optional(),
  items: z.object({ data: z.array(z.object({ current_period_end: z.number().int().optional() })) }).optional(),
  metadata: z.object({ account_id: z.string().uuid().optional() }).passthrough(),
});

export const SUBSCRIPTION_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

export type ApplyResult = 'applied' | 'duplicate' | 'ignored';

/**
 * Applies a verified event exactly once. The event id is inserted into
 * `stripe_events` in the same transaction as the subscription write: a
 * redelivery hits the primary key and does nothing, and a failure rolls the
 * marker back too, so Stripe's retry is processed rather than swallowed.
 * An event older than the row it would change is dropped (Stripe does not
 * guarantee ordering).
 */
export async function applyStripeEvent(event: StripeEvent, nowMs: number = Date.now()): Promise<ApplyResult> {
  if (!(SUBSCRIPTION_EVENTS as readonly string[]).includes(event.type)) return 'ignored';
  const sub = SubscriptionObjectSchema.parse(event.data.object);
  const accountId = sub.metadata.account_id;
  if (!accountId) return 'ignored'; // not a subscription this app created

  const periodEnd = sub.current_period_end ?? sub.items?.data[0]?.current_period_end;
  const row = {
    account_id: accountId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEnd === undefined ? null : periodEnd * 1000,
    cancel_at_period_end: sub.cancel_at_period_end,
    last_event_at: event.created * 1000,
    updated_at: nowMs,
  };

  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(stripe_events)
      .values({ id: event.id, type: event.type, received_at: nowMs })
      .onConflictDoNothing()
      .returning({ id: stripe_events.id });
    if (claimed.length === 0) return 'duplicate';

    const { account_id: _id, ...changes } = row;
    await tx
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: subscriptions.account_id,
        set: changes,
        setWhere: lte(subscriptions.last_event_at, row.last_event_at),
      });
    return 'applied';
  });
}

// ---- promo codes as Stripe discounts ----

export interface PersonalDiscount {
  code: string;
  percent_off: number;
  applies_to: 'annual' | 'any';
}

/**
 * The early-access discount this person holds: their own code (users.personal_code)
 * under an offer that is still active and has a percentage decided. The offer's
 * dates only govern who is issued a code, not when a held code stops working
 * (an admin can also issue one by hand outside them), so they are not checked here.
 */
export async function loadPersonalDiscount(userId: string): Promise<PersonalDiscount | null> {
  const [row] = await db
    .select({ code: users.personal_code, percent_off: promo_codes.percent_off, applies_to: promo_codes.applies_to, active: promo_codes.active })
    .from(users)
    .innerJoin(promo_codes, eq(promo_codes.code, users.promo_code))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.code || !row.active || row.percent_off === null) return null;
  return { code: row.code, percent_off: row.percent_off, applies_to: row.applies_to };
}

/** `applies_to: 'annual'` only discounts a yearly price; `'any'` discounts whatever the price is. */
export function discountApplies(discount: Pick<PersonalDiscount, 'applies_to'>, priceInterval: string | null): boolean {
  return discount.applies_to === 'any' || priceInterval === 'year';
}

/** Deterministic, so one coupon per percentage is shared by everyone and found again later. */
export const couponIdFor = (percentOff: number): string => `chipperly-early-${percentOff}pct-12mo`;

const CouponSchema = z.object({ id: z.string() });
type StripeCall = typeof stripeRequest;

/**
 * Finds the coupon for this percentage in Stripe, creating it on first use, so
 * nothing has to be set up in the dashboard and no amount is hardcoded. It
 * takes 12 months off the top, which is one full year for an annual plan and
 * the first year of a monthly one.
 */
export async function ensureCoupon(percentOff: number, call: StripeCall = stripeRequest): Promise<string> {
  const id = couponIdFor(percentOff);
  const find = async (): Promise<boolean> => {
    try {
      await call('GET', `/coupons/${encodeURIComponent(id)}`, CouponSchema);
      return true;
    } catch (err) {
      if (err instanceof StripeApiError && err.stripeStatus === 404) return false;
      throw err;
    }
  };
  if (await find()) return id;
  try {
    await call('POST', '/coupons', CouponSchema, {
      id,
      percent_off: String(percentOff),
      duration: 'repeating',
      duration_in_months: '12',
      name: `Early access ${percentOff}% off`,
    });
  } catch (err) {
    // Two checkouts racing to create it: the loser's create fails, the coupon exists now.
    if (!(await find())) throw err;
  }
  return id;
}

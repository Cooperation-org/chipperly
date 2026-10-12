import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AccountKind } from '@chipperly/shared/schemas/account';
import { PurchasableKind, SubscriptionStatus, type BillingPlan } from '@chipperly/shared/schemas/billing';
import { HOUSEHOLD_ADMIN_LIMIT, PROFILE_LIMITS } from '@chipperly/shared/constants/limits';
import { db } from '../db/client.js';
import { account_members, accounts, invites, promo_codes, users } from '../db/schema/accounts.js';
import { profiles } from '../db/schema/profiles.js';
import { stripe_events, subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { renderEmail, siteOrigin } from './emailTemplate.js';
import { sendMail } from './mailer.js';
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
/** Every price this kind can be bought at: the default one first, then the yearly one if the owner set it. */
export function priceIdsForKind(kind: AccountKind): Array<{ plan: BillingPlan; id: string }> {
  const yearly: Record<AccountKind, string | undefined> = {
    individual: env.STRIPE_PRICE_INDIVIDUAL_YEARLY,
    household: env.STRIPE_PRICE_HOUSEHOLD_YEARLY,
    agency: env.STRIPE_PRICE_AGENCY_YEARLY,
    supported: env.STRIPE_PRICE_SUPPORTED_YEARLY,
  };
  const base = priceIdForKind(kind);
  return [...(base ? [{ plan: 'default' as const, id: base }] : []), ...(yearly[kind] && base ? [{ plan: 'yearly' as const, id: yearly[kind]! }] : [])];
}

/** The self-serve kind a price id (monthly or yearly) belongs to; undefined for an unknown price or an organization. */
export function kindForPriceId(id: string): AccountKind | undefined {
  return PurchasableKind.options.find((k) => priceIdsForKind(k).some((p) => p.id === id));
}

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
  items: z.object({ data: z.array(z.object({ current_period_end: z.number().int().optional(), price: z.object({ id: z.string() }).optional() })) }).optional(),
  metadata: z.object({ account_id: z.string().uuid().optional() }).passthrough(),
});

export const SUBSCRIPTION_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

export const DISPUTE_EVENTS = ['charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'] as const;

export type ApplyResult = 'applied' | 'duplicate' | 'ignored';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PlanMisfit = 'too_many_profiles' | 'too_many_admins';

/**
 * Why an account does not fit a plan, or null when it does: more live profiles than the plan allows,
 * or, for a family plan, more than HOUSEHOLD_ADMIN_LIMIT admins. `pending` also counts admin invites
 * not yet accepted, the way inviting does.
 */
export async function planMisfit(q: Pick<Tx, 'select'>, accountId: string, kind: AccountKind, pending = false): Promise<PlanMisfit | null> {
  const count = sql<number>`count(*)::int`;
  const [live] = await q.select({ n: count }).from(profiles).where(and(eq(profiles.account_id, accountId), isNull(profiles.deleted_at)));
  if ((live?.n ?? 0) > PROFILE_LIMITS[kind]) return 'too_many_profiles';
  if (kind !== 'household') return null;
  const [admins] = await q.select({ n: count }).from(account_members).where(and(eq(account_members.account_id, accountId), eq(account_members.role, 'admin')));
  const [open] = pending
    ? await q
        .select({ n: count })
        .from(invites)
        .where(and(eq(invites.account_id, accountId), eq(invites.role, 'admin'), isNull(invites.accepted_at), gt(invites.expires_at, Date.now())))
    : [{ n: 0 }];
  return (admins?.n ?? 0) + (open?.n ?? 0) > HOUSEHOLD_ADMIN_LIMIT ? 'too_many_admins' : null;
}

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

  const { result, notice, misfit } = await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(stripe_events)
      .values({ id: event.id, type: event.type, received_at: nowMs })
      .onConflictDoNothing()
      .returning({ id: stripe_events.id });
    if (claimed.length === 0) return { result: 'duplicate' as const, notice: null, misfit: null };

    const [prev] = await tx.select().from(subscriptions).where(eq(subscriptions.account_id, accountId)).limit(1);
    const { account_id: _id, ...changes } = row;
    await tx
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: subscriptions.account_id,
        set: changes,
        setWhere: lte(subscriptions.last_event_at, row.last_event_at),
      });
    const stale = prev !== undefined && prev.last_event_at > row.last_event_at;
    // The plan that was paid for (at checkout or later in the portal) becomes the account's kind,
    // unless the account does not fit it (a portal downgrade skips checkout's checks): then a person sorts it out.
    const paidKind = sub.items?.data[0]?.price && kindForPriceId(sub.items.data[0].price.id);
    let misfit: { name: string; from: AccountKind; to: AccountKind; why: PlanMisfit } | null = null;
    if (!stale && paidKind && PAID.has(row.status)) {
      const [account] = await tx.select({ kind: accounts.kind, name: accounts.name }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
      if (account && account.kind !== 'agency' && account.kind !== paidKind) {
        const why = await planMisfit(tx, accountId, paidKind);
        if (why) misfit = { name: account.name, from: account.kind, to: paidKind, why };
        else await tx.update(accounts).set({ kind: paidKind }).where(eq(accounts.id, accountId));
      }
    }
    return { result: 'applied' as const, notice: stale ? null : subscriptionNotice(prev, row), misfit };
  });
  if (notice) await mailAccountAdmins(accountId, notice, row.current_period_end);
  if (misfit) await mailPlanMisfit(accountId, misfit);
  return result;
}

async function mailPlanMisfit(accountId: string, m: { name: string; from: AccountKind; to: AccountKind; why: PlanMisfit }): Promise<void> {
  const has = m.why === 'too_many_profiles' ? 'more profiles' : 'more admins';
  console.warn(`stripe: account ${accountId} paid for ${m.to} but has ${has} than it allows; kind left as ${m.from}`);
  const mail = renderEmail({
    heading: 'A plan change needs a look',
    paragraphs: [
      `${m.name} now pays for the ${m.to} plan, but it has ${has} than that plan allows.`,
      `Its account type was left as ${m.from}. Check the subscription in Stripe and talk to the account admin.`,
    ],
    action: { label: 'Open the payments log', url: `${siteOrigin()}/settings/admin/payments/` },
  });
  for (const to of env.superAdminEmails) await sendMail({ to, subject: 'Chipperly plan change needs a look', ...mail });
}

const DisputeSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  reason: z.string().default('unknown'),
  status: z.string(),
  charge: z.string().nullish(),
});
type StripeCall = typeof stripeRequest;

/**
 * Logs a dispute (amount, reason, status, and the account when the charge's
 * customer is one we know) and emails the super admins when it opens or closes.
 * It never cancels or refunds anything: that is a person's call.
 * The Stripe webhook endpoint must also be subscribed to charge.dispute.created,
 * charge.dispute.updated and charge.dispute.closed in the Stripe dashboard, or
 * these events never arrive.
 */
export async function applyDisputeEvent(event: StripeEvent, call: StripeCall = stripeRequest, nowMs: number = Date.now()): Promise<ApplyResult> {
  if (!(DISPUTE_EVENTS as readonly string[]).includes(event.type)) return 'ignored';
  const dispute = DisputeSchema.parse(event.data.object);

  let accountId: string | null = null;
  let accountName: string | null = null;
  try {
    const charge = dispute.charge ? await call('GET', `/charges/${encodeURIComponent(dispute.charge)}`, z.object({ customer: z.string().nullish() })) : null;
    if (charge?.customer) {
      const [row] = await db
        .select({ id: subscriptions.account_id, name: accounts.name })
        .from(subscriptions)
        .leftJoin(accounts, eq(accounts.id, subscriptions.account_id))
        .where(eq(subscriptions.stripe_customer_id, charge.customer))
        .limit(1);
      accountId = row?.id ?? null;
      accountName = row?.name ?? null;
    }
  } catch {
    // The dispute is still worth logging without its account.
  }

  const detail = `${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}, ${dispute.reason.replace(/_/g, ' ')}`;
  const claimed = await db
    .insert(stripe_events)
    .values({ id: event.id, type: event.type, received_at: nowMs, result: 'applied', account_id: accountId, status: dispute.status, detail })
    .onConflictDoNothing()
    .returning({ id: stripe_events.id });
  if (claimed.length === 0) return 'duplicate';

  if (event.type !== 'charge.dispute.updated') {
    const verb = event.type === 'charge.dispute.created' ? 'opened' : 'closed';
    const mail = renderEmail({
      heading: `A payment dispute was ${verb}`,
      paragraphs: [
        `${detail}. Status: ${dispute.status.replace(/_/g, ' ')}.`,
        accountName ? `Account: ${accountName}.` : 'We could not match it to an account.',
        'Nothing was cancelled or refunded. Respond to it in the Stripe dashboard.',
      ],
      action: { label: 'Open the payments log', url: `${siteOrigin()}/settings/admin/payments/` },
    });
    for (const to of env.superAdminEmails) await sendMail({ to, subject: `Chipperly payment dispute ${verb}`, ...mail });
  }
  return 'applied';
}

const LoggedObjectSchema = z.object({ status: z.string().optional(), metadata: z.object({ account_id: z.string().uuid().optional() }).optional() });

/**
 * Notes what was done with a verified event, for the super admin's payments
 * log. Events the app ignores are kept too, so "did Stripe reach us?" has an
 * answer. A redelivery changes nothing.
 */
export async function recordStripeEvent(event: StripeEvent, result: ApplyResult, nowMs: number = Date.now()): Promise<void> {
  if (result === 'duplicate') return;
  const parsed = LoggedObjectSchema.safeParse(event.data.object);
  const seen = { result, account_id: parsed.data?.metadata?.account_id ?? null, status: parsed.data?.status ?? null };
  await db
    .insert(stripe_events)
    .values({ id: event.id, type: event.type, received_at: nowMs, ...seen })
    .onConflictDoUpdate({ target: stripe_events.id, set: seen });
}

// ---- billing emails ----

type Notice = 'started' | 'cancel_scheduled' | 'payment_failed' | 'ended';
type SubState = { status: string; cancel_at_period_end: boolean };
const PAID = new Set(['active', 'trialing']);

/** What changed for the customer, if anything worth an email. Pure. */
export function subscriptionNotice(prev: SubState | undefined, next: SubState): Notice | null {
  if (next.status === 'canceled') return prev?.status === 'canceled' ? null : 'ended';
  if (next.status === 'past_due') return prev?.status === 'past_due' ? null : 'payment_failed';
  if (PAID.has(next.status) && !(prev && PAID.has(prev.status))) return 'started';
  if (next.cancel_at_period_end && !prev?.cancel_at_period_end) return 'cancel_scheduled';
  return null;
}

const fmtDate = (ms: number | null): string =>
  ms === null ? 'the end of the current period' : new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export function noticeMail(notice: Notice, periodEnd: number | null): { subject: string; text: string; html: string } {
  const manage = `${siteOrigin()}/settings/billing/`;
  const end = fmtDate(periodEnd);
  switch (notice) {
    case 'started':
      return {
        subject: 'Your Chipperly subscription is active',
        ...renderEmail({
          heading: 'Your subscription is active',
          paragraphs: ['Thanks for subscribing to Chipperly.', `Your subscription renews on ${end}. You can manage or cancel it any time.`],
          action: { label: 'Manage subscription', url: manage },
        }),
      };
    case 'cancel_scheduled':
      return {
        subject: 'Your Chipperly subscription will end',
        ...renderEmail({
          heading: 'Your subscription will end',
          paragraphs: [
            `You cancelled your Chipperly subscription. It stays active until ${end}, and you will not be charged again.`,
            `You keep full access until ${end}. If this is a yearly plan and you would like a refund for the unused part, write to support@chipperlyapp.com and we will take care of it. Monthly plans are not refunded: you just keep your time until that date.`,
          ],
          action: { label: 'Keep my subscription', url: manage },
          note: 'Changed your mind? Use the button before the end date and nothing changes.',
        }),
      };
    case 'payment_failed':
      return {
        subject: 'We could not charge your card for Chipperly',
        ...renderEmail({
          heading: 'Your payment did not go through',
          paragraphs: ['Your latest Chipperly payment failed. Your access continues while Stripe tries the card again.', 'Please check or replace your payment method.'],
          action: { label: 'Update payment method', url: manage },
        }),
      };
    case 'ended':
      return {
        subject: 'Your Chipperly subscription has ended',
        ...renderEmail({
          heading: 'Your subscription has ended',
          paragraphs: [
            'Everything you made is still there to read, edit and export.',
            'After a short grace period, creating new routines pauses until you subscribe again.',
          ],
          action: { label: 'Subscribe again', url: manage },
        }),
      };
  }
}

async function mailAccountAdmins(accountId: string, notice: Notice, periodEnd: number | null): Promise<void> {
  const admins = await db
    .select({ email: users.email })
    .from(account_members)
    .innerJoin(users, eq(users.id, account_members.user_id))
    .where(and(eq(account_members.account_id, accountId), eq(account_members.role, 'admin')));
  const { subject, text, html } = noticeMail(notice, periodEnd);
  for (const { email } of admins) await sendMail({ to: email, subject, text, html });
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

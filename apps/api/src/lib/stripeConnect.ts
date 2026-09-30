import { and, eq, lte } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { SellerStatus } from '@chipperly/shared/schemas/community';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { community_purchases, community_sellers } from '../db/schema/community.js';
import { stripe_events } from '../db/schema/subscriptions.js';
import { AppError } from '../plugins/errors.js';
import { stripeRequest, type StripeEvent } from './stripe.js';

// Stripe Connect for selling a shared item. Same rules as lib/stripe.ts: no SDK,
// REST through `stripeRequest`, signature checked by `verifyStripeSignature`.
// Gating is the caller's job (routes/community.ts): every selling route 404s
// unless `env.stripeEnabled`.

// ---- configuration ----

const FeePercentSchema = z.coerce.number().min(0).max(100);

/**
 * COMMUNITY_PLATFORM_FEE_PERCENT, e.g. `10` or `2.5`. Null = the owner has not set one,
 * so nothing can be sold. Read from process.env per call, not from the parsed `env`,
 * because `env` is parsed once at import: the fee is the one setting an operator may
 * want to change without a redeploy, and the tests set it per case. env.ts still
 * declares it so a malformed value fails at boot rather than silently disabling sales.
 */
export function platformFeePercent(): number | null {
  const raw = process.env.COMMUNITY_PLATFORM_FEE_PERCENT;
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = FeePercentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Whole minor units, rounded to nearest, never more than the price. Pure. */
export function platformFeeAmount(amount: number, percent: number): number {
  return Math.min(amount, Math.max(0, Math.round((amount * percent) / 100)));
}

/** Secrets that may sign a webhook: the platform endpoint and, if set, the Connect ("connected accounts") endpoint. */
export function webhookSecrets(platformSecret: string | undefined): string[] {
  return [platformSecret, env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => Boolean(s));
}

// ---- seller status ----

type SellerRow = typeof community_sellers.$inferSelect;

export function sellerStatus(row: SellerRow | null, feeConfigured: boolean): SellerStatus {
  const connected = row !== null;
  const charges = row?.charges_enabled ?? false;
  const payouts = row?.payouts_enabled ?? false;
  let reason: string | null = null;
  if (!feeConfigured) reason = 'Selling is not switched on yet: no platform fee has been set.';
  else if (!connected) reason = 'Set up payouts first. Stripe collects your details and where the money should go.';
  else if (!charges) reason = 'Stripe has not finished checking your account, so it cannot take payments yet.';
  else if (!payouts) reason = 'Stripe has not enabled payouts on your account yet, so it cannot pay you.';
  return {
    connected,
    details_submitted: row?.details_submitted ?? false,
    charges_enabled: charges,
    payouts_enabled: payouts,
    fee_configured: feeConfigured,
    can_sell: reason === null,
    reason,
  };
}

export async function getSeller(userId: string): Promise<SellerRow | null> {
  const [row] = await db.select().from(community_sellers).where(eq(community_sellers.user_id, userId)).limit(1);
  return row ?? null;
}

const AccountSchema = z.object({
  id: z.string().min(1),
  charges_enabled: z.boolean().default(false),
  payouts_enabled: z.boolean().default(false),
  details_submitted: z.boolean().default(false),
});

/** Creates the seller's Express account on first use and remembers it. Safe to call twice. */
export async function ensureSellerAccount(userId: string, nowMs: number = Date.now()): Promise<SellerRow> {
  const existing = await getSeller(userId);
  if (existing) return existing;
  const account = await stripeRequest('POST', '/accounts', AccountSchema, {
    type: 'express',
    // A destination charge needs the seller to be able to receive transfers and to be charge-enabled.
    'capabilities[card_payments][requested]': 'true',
    'capabilities[transfers][requested]': 'true',
    'metadata[user_id]': userId,
  });
  const [row] = await db
    .insert(community_sellers)
    .values({
      user_id: userId,
      stripe_account_id: account.id,
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      created_at: nowMs,
      updated_at: nowMs,
    })
    .onConflictDoNothing()
    .returning();
  // Lost a race with a second tap: use the winner's row (the extra Stripe account stays empty and unused).
  const winner = row ?? (await getSeller(userId));
  if (!winner) throw new AppError(500, 'internal', 'Seller account not saved');
  return winner;
}

/** A single-use link into Stripe's hosted onboarding. Stripe redirects to `refresh_url` when the link expired. */
export async function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const { url } = await stripeRequest('POST', '/account_links', z.object({ url: z.string().url() }), {
    account: accountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return url;
}

/** Reads the account from Stripe and stores the flags. Used on return from onboarding, before the webhook lands. */
export async function refreshSeller(row: SellerRow, nowMs: number = Date.now()): Promise<SellerRow> {
  const account = await stripeRequest('GET', `/accounts/${encodeURIComponent(row.stripe_account_id)}`, AccountSchema);
  const [updated] = await db
    .update(community_sellers)
    .set({
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      updated_at: nowMs,
    })
    .where(eq(community_sellers.user_id, row.user_id))
    .returning();
  return updated ?? row;
}

// ---- checkout ----

const SessionSchema = z.object({ id: z.string().min(1), url: z.string().url() });

export interface CheckoutInput {
  purchaseId: string;
  title: string;
  amount: number;
  currency: string;
  feeAmount: number;
  destinationAccountId: string;
  buyerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

/** Destination charge: the buyer pays the platform, `feeAmount` stays here, the rest transfers to the seller. */
export function createPurchaseSession(input: CheckoutInput): Promise<z.infer<typeof SessionSchema>> {
  return stripeRequest('POST', '/checkout/sessions', SessionSchema, {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': String(input.amount),
    'line_items[0][price_data][product_data][name]': input.title,
    // Stripe rejects a zero application fee, so a 0% fee simply leaves it out.
    'payment_intent_data[application_fee_amount]': input.feeAmount > 0 ? String(input.feeAmount) : undefined,
    'payment_intent_data[transfer_data][destination]': input.destinationAccountId,
    'payment_intent_data[metadata][purchase_id]': input.purchaseId,
    client_reference_id: input.purchaseId,
    // The webhook finds the purchase through this metadata.
    'metadata[purchase_id]': input.purchaseId,
    customer_email: input.buyerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Best effort: closes an abandoned session so it cannot be paid after a newer one was started. */
export async function expireSession(sessionId: string): Promise<void> {
  try {
    await stripeRequest('POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, z.unknown());
  } catch {
    // Already completed or expired. The webhook decides what happens to a completed one.
  }
}

/**
 * Finds or starts the one purchase row for (post, buyer). The unique index makes a
 * concurrent second call return the same row. `paid` means the caller must refuse.
 */
export async function claimPurchase(input: {
  postId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  feeAmount: number;
}, nowMs: number = Date.now()): Promise<typeof community_purchases.$inferSelect> {
  await db
    .insert(community_purchases)
    .values({
      id: uuidv7(),
      post_id: input.postId,
      buyer_user_id: input.buyerId,
      seller_user_id: input.sellerId,
      status: 'pending',
      amount: input.amount,
      currency: input.currency,
      application_fee_amount: input.feeAmount,
      created_at: nowMs,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(community_purchases)
    .where(and(eq(community_purchases.post_id, input.postId), eq(community_purchases.buyer_user_id, input.buyerId)))
    .limit(1);
  if (!row) throw new AppError(500, 'internal', 'Purchase not saved');
  return row;
}

// ---- webhook events ----

const AccountObjectSchema = AccountSchema;
const CheckoutObjectSchema = z.object({
  id: z.string().min(1),
  payment_status: z.string(),
  amount_total: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  payment_intent: z.string().nullable().optional(),
  metadata: z.object({ purchase_id: z.string().uuid().optional() }).passthrough().nullable().optional(),
});

export const CONNECT_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'account.updated',
] as const;

export type ConnectApplyResult =
  | 'applied'
  | 'duplicate'
  | 'ignored'
  /** Paid amount or currency differs from the purchase row. Nothing was granted. */
  | 'mismatch'
  /** A second payment for a purchase that is already paid. Needs a manual refund. */
  | 'duplicate_payment';

/**
 * Applies a verified event exactly once. As in `applyStripeEvent`, the event id is
 * inserted into `stripe_events` in the same transaction as the write: a redelivery
 * hits the primary key and does nothing, and a failure rolls the marker back so
 * Stripe's retry is processed.
 */
export async function applyConnectEvent(event: StripeEvent, nowMs: number = Date.now()): Promise<ConnectApplyResult> {
  if (event.type === 'account.updated') return applyAccountUpdated(event, nowMs);
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    return applyCheckoutPaid(event, nowMs);
  }
  return 'ignored';
}

async function applyAccountUpdated(event: StripeEvent, nowMs: number): Promise<ConnectApplyResult> {
  const account = AccountObjectSchema.parse(event.data.object);
  const [seller] = await db
    .select({ user_id: community_sellers.user_id })
    .from(community_sellers)
    .where(eq(community_sellers.stripe_account_id, account.id))
    .limit(1);
  if (!seller) return 'ignored'; // not an account this app created

  const at = event.created * 1000;
  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(stripe_events)
      .values({ id: event.id, type: event.type, received_at: nowMs })
      .onConflictDoNothing()
      .returning({ id: stripe_events.id });
    if (claimed.length === 0) return 'duplicate';
    await tx
      .update(community_sellers)
      .set({
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        last_event_at: at,
        updated_at: nowMs,
      })
      .where(and(eq(community_sellers.stripe_account_id, account.id), lte(community_sellers.last_event_at, at)));
    return 'applied';
  });
}

async function applyCheckoutPaid(event: StripeEvent, nowMs: number): Promise<ConnectApplyResult> {
  const session = CheckoutObjectSchema.parse(event.data.object);
  const purchaseId = session.metadata?.purchase_id;
  if (!purchaseId) return 'ignored'; // not a session this app created (e.g. a subscription checkout)
  if (session.payment_status !== 'paid') return 'ignored'; // a delayed method: the async_payment_succeeded event follows

  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(stripe_events)
      .values({ id: event.id, type: event.type, received_at: nowMs })
      .onConflictDoNothing()
      .returning({ id: stripe_events.id });
    if (claimed.length === 0) return 'duplicate';

    const [purchase] = await tx
      .select()
      .from(community_purchases)
      .where(eq(community_purchases.id, purchaseId))
      .limit(1)
      .for('update');
    if (!purchase) return 'ignored';
    if (purchase.status === 'paid') {
      // Same payment seen through a second event type is harmless; a different one is a double charge.
      return purchase.stripe_payment_intent_id === (session.payment_intent ?? null) ? 'duplicate' : 'duplicate_payment';
    }
    if (session.amount_total !== purchase.amount || session.currency?.toLowerCase() !== purchase.currency) return 'mismatch';

    await tx
      .update(community_purchases)
      .set({
        status: 'paid',
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent ?? null,
        paid_at: nowMs,
      })
      .where(eq(community_purchases.id, purchase.id));
    return 'applied';
  });
}

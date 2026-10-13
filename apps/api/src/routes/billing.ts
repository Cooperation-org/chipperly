import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AccountKind } from '@chipperly/shared/schemas/account';
import { BillingCheckoutBodySchema, PurchasableKind, type BillingStatus } from '@chipperly/shared/schemas/billing';
import { HOUSEHOLD_ADMIN_LIMIT, PROFILE_LIMITS } from '@chipperly/shared/constants/limits';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { linkBase } from '../lib/links.js';
import {
  applyDisputeEvent,
  applyStripeEvent,
  discountApplies,
  ensureCoupon,
  loadPersonalDiscount,
  parseStripeEvent,
  planMisfit,
  priceIdForKind,
  priceIdsForKind,
  recordStripeEvent,
  stripeRequest,
  verifyStripeSignature,
} from '../lib/stripe.js';
import { accountAccess } from '../lib/trial.js';
import { readOnlyError, requireAccount } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

const PriceSchema = z.object({
  unit_amount: z.number().int().nullable(),
  currency: z.string(),
  recurring: z.object({ interval: z.string() }).nullable(),
});
const UrlSchema = z.object({ url: z.string().url() });

function caller(request: FastifyRequest): { userId: string; accountId: string } {
  if (!request.user || !request.accountId) throw new AppError(401, 'unauthorized', 'Sign-in required');
  return { userId: request.user.id, accountId: request.accountId };
}

const LIVE_STATES = new Set(['active', 'trialing', 'past_due']);

// ponytail: per-process cache, one Stripe call per price per 10 min; shared cache only if we run several API processes.
const priceCache = new Map<string, { at: number; value: BillingStatus['price'] }>();
async function readPrice(priceId: string): Promise<BillingStatus['price']> {
  const hit = priceCache.get(priceId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const price = await stripeRequest('GET', `/prices/${encodeURIComponent(priceId)}`, PriceSchema);
  const value =
    price.unit_amount === null
      ? null
      : { amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval ?? null };
  priceCache.set(priceId, { at: Date.now(), value });
  return value;
}

/**
 * Stripe subscriptions, gated the way Google sign-in is: with STRIPE_SECRET_KEY
 * or STRIPE_WEBHOOK_SECRET unset every route here 404s (checked per request).
 * Registered from app.ts. Not built: Stripe Connect / seller payouts.
 */
export default async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async () => {
    if (!env.stripeEnabled) throw new AppError(404, 'not_found', 'Billing is not enabled');
  });

  async function accountContext(accountId: string, userId: string) {
    const [account] = await db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) throw new AppError(404, 'not_found', 'Account not found');
    const [member] = await db
      .select({ role: account_members.role })
      .from(account_members)
      .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, userId)))
      .limit(1);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.account_id, accountId)).limit(1);
    return { kind: account.kind, isAdmin: member?.role === 'admin', isViewer: member?.role === 'viewer', sub: sub ?? null };
  }

  app.get('/billing', { preHandler: requireAccount }, async (request): Promise<BillingStatus> => {
    const { accountId, userId } = caller(request);
    const { kind, isAdmin, sub } = await accountContext(accountId, userId);
    const priceId = priceIdForKind(kind);
    const pricesFor = async (k: AccountKind): Promise<BillingStatus['prices']> => {
      const out: BillingStatus['prices'] = [];
      for (const { plan, id } of priceIdsForKind(k)) {
        try {
          const read = await readPrice(id);
          if (read) out.push({ plan, ...read });
        } catch (err) {
          request.log.warn({ err }, 'could not read the Stripe price');
        }
      }
      return out;
    };
    const prices = await pricesFor(kind);
    const kinds: BillingStatus['kinds'] = [];
    for (const k of PurchasableKind.options) {
      const p = k === kind ? prices : await pricesFor(k);
      if (p.length > 0) kinds.push({ kind: k, prices: p });
    }
    const price: BillingStatus['price'] = prices[0] ? { amount: prices[0].amount, currency: prices[0].currency, interval: prices[0].interval } : null;
    // Checkout only applies it to a first subscription, so stop advertising it once one exists.
    const held = sub ? null : await loadPersonalDiscount(userId);
    // It applies if any plan that can be bought here fits it, since the person can pick another plan.
    const buyable = kind === 'agency' ? prices : kinds.flatMap((k) => k.prices);
    return {
      kind,
      checkout_available: Boolean(priceId),
      price,
      prices,
      kinds,
      subscription: sub
        ? { status: sub.status, current_period_end: sub.current_period_end, cancel_at_period_end: sub.cancel_at_period_end }
        : null,
      can_manage: isAdmin,
      access: await accountAccess(accountId),
      discount: held ? { ...held, applicable: (buyable.length > 0 ? buyable : [{ interval: null }]).some((p) => discountApplies(held, p.interval)) } : null,
    };
  });

  app.post('/billing/checkout', { preHandler: requireAccount }, async (request) => {
    const { accountId, userId } = caller(request);
    const { kind, isAdmin, isViewer, sub } = await accountContext(accountId, userId);
    if (isViewer) throw readOnlyError();
    if (!isAdmin) throw new AppError(403, 'forbidden', 'Admin role required');
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const { plan, kind: chosen } = BillingCheckoutBodySchema.parse(request.body ?? {});
    // The price id always comes from our env for the chosen kind, never from the client.
    const target = chosen ?? kind;
    if (kind === 'agency' && target !== 'agency') throw new AppError(409, 'pay_by_arrangement', 'Organization plans are set up by email');
    const priceId = priceIdsForKind(target).find((p) => p.plan === plan)?.id;
    if (!priceId) throw new AppError(409, 'price_not_set', 'No price is set for this kind of account yet');
    // Changing plan on a live subscription happens in the Stripe portal; its webhook switches the kind.
    if (sub && LIVE_STATES.has(sub.status)) throw new AppError(409, 'already_subscribed', 'This account already has a subscription. Change plan in the billing portal.');
    const misfit = await planMisfit(db, accountId, target, true);
    if (misfit === 'too_many_profiles') throw new AppError(409, misfit, `This plan allows ${PROFILE_LIMITS[target]} profile${PROFILE_LIMITS[target] === 1 ? '' : 's'}. Remove some profiles first, then subscribe.`);
    if (misfit === 'too_many_admins') throw new AppError(409, misfit, `A family plan can have ${HOUSEHOLD_ADMIN_LIMIT} admins. Change the other admins to members, or cancel open admin invites, first.`);

    // The early-access discount rides along on a first subscription only, and
    // only when its plan restriction fits the price being bought. A Stripe
    // failure here fails the checkout (the person can retry) instead of
    // silently charging full price to someone who was promised a discount.
    let coupon: string | undefined;
    const held = sub ? null : await loadPersonalDiscount(userId);
    if (held && discountApplies(held, (await readPrice(priceId))?.interval ?? null)) coupon = await ensureCoupon(held.percent_off);

    const back = `${linkBase(request)}/settings/billing/`;
    const { url } = await stripeRequest('POST', '/checkout/sessions', UrlSchema, {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: accountId,
      // The webhook finds the account through this metadata.
      'subscription_data[metadata][account_id]': accountId,
      'discounts[0][coupon]': coupon,
      customer: sub?.stripe_customer_id,
      customer_email: sub ? undefined : user?.email,
      success_url: `${back}?checkout=done`,
      cancel_url: back,
    });
    return { url };
  });

  app.post('/billing/portal', { preHandler: requireAccount }, async (request) => {
    const { accountId, userId } = caller(request);
    const { isAdmin, isViewer, sub } = await accountContext(accountId, userId);
    if (isViewer) throw readOnlyError();
    if (!isAdmin) throw new AppError(403, 'forbidden', 'Admin role required');
    if (!sub) throw new AppError(409, 'no_subscription', 'This account has no subscription to manage');
    const { url } = await stripeRequest('POST', '/billing_portal/sessions', UrlSchema, {
      customer: sub.stripe_customer_id,
      return_url: `${linkBase(request)}/settings/billing/`,
    });
    return { url };
  });

  // The webhook needs the exact bytes Stripe signed, so it lives in its own
  // encapsulated scope with a raw-body JSON parser; no other route is affected.
  await app.register(async (hook) => {
    hook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    hook.post('/billing/webhook', async (request, reply) => {
      const raw = request.body;
      const secret = env.STRIPE_WEBHOOK_SECRET;
      const header = request.headers['stripe-signature'];
      if (!secret || !Buffer.isBuffer(raw) || !verifyStripeSignature(raw, Array.isArray(header) ? header[0] : header, secret)) {
        throw new AppError(400, 'bad_signature', 'Invalid signature');
      }
      const event = parseStripeEvent(JSON.parse(raw.toString('utf8')));
      if (event.type.startsWith('charge.dispute.')) return { received: true, result: await applyDisputeEvent(event) }; // logs itself
      const result = await applyStripeEvent(event);
      await recordStripeEvent(event, result);
      reply.code(200);
      return { received: true, result };
    });
  });
}

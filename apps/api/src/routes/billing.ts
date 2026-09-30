import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BillingStatus } from '@chipperly/shared/schemas/billing';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { linkBase } from '../lib/links.js';
import { applyStripeEvent, parseStripeEvent, priceIdForKind, stripeRequest, verifyStripeSignature } from '../lib/stripe.js';
import { requireAccount } from '../plugins/auth.js';
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
    return { kind: account.kind, isAdmin: member?.role === 'admin', sub: sub ?? null };
  }

  app.get('/billing', { preHandler: requireAccount }, async (request): Promise<BillingStatus> => {
    const { accountId, userId } = caller(request);
    const { kind, isAdmin, sub } = await accountContext(accountId, userId);
    const priceId = priceIdForKind(kind);
    let price: BillingStatus['price'] = null;
    if (priceId) {
      try {
        price = await readPrice(priceId);
      } catch (err) {
        request.log.warn({ err }, 'could not read the Stripe price');
      }
    }
    return {
      kind,
      checkout_available: Boolean(priceId),
      price,
      subscription: sub
        ? { status: sub.status, current_period_end: sub.current_period_end, cancel_at_period_end: sub.cancel_at_period_end }
        : null,
      can_manage: isAdmin,
    };
  });

  app.post('/billing/checkout', { preHandler: requireAccount }, async (request) => {
    const { accountId, userId } = caller(request);
    const { kind, isAdmin, sub } = await accountContext(accountId, userId);
    if (!isAdmin) throw new AppError(403, 'forbidden', 'Admin role required');
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const priceId = priceIdForKind(kind);
    if (!priceId) throw new AppError(409, 'price_not_set', 'No price is set for this kind of account yet');
    if (sub && LIVE_STATES.has(sub.status)) throw new AppError(409, 'already_subscribed', 'This account already has a subscription');

    const back = `${linkBase(request)}/settings/billing/`;
    const { url } = await stripeRequest('POST', '/checkout/sessions', UrlSchema, {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: accountId,
      // The webhook finds the account through this metadata.
      'subscription_data[metadata][account_id]': accountId,
      customer: sub?.stripe_customer_id,
      customer_email: sub ? undefined : user?.email,
      success_url: `${back}?checkout=done`,
      cancel_url: back,
    });
    return { url };
  });

  app.post('/billing/portal', { preHandler: requireAccount }, async (request) => {
    const { accountId, userId } = caller(request);
    const { isAdmin, sub } = await accountContext(accountId, userId);
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
      const result = await applyStripeEvent(parseStripeEvent(JSON.parse(raw.toString('utf8'))));
      reply.code(200);
      return { received: true, result };
    });
  });
}

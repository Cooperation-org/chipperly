import { eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { ORG_TIERS, type FixedOrgTier } from '@chipperly/shared/constants/orgTiers';
import type { AdminCharge, AdminChargesPage, AdminSubscription, CreateOrgBillingBody, OrgBilling } from '@chipperly/shared/schemas/admin';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { admin_actions, org_billing, subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { AppError } from '../plugins/errors.js';
import { stripeRequest } from './stripe.js';

// The admin site's view of Stripe (routes/adminBilling.ts). Every Stripe call
// goes through `call` so tests can fake it.
export type StripeCall = typeof stripeRequest;

const LIVE = new Set(['active', 'trialing', 'past_due', 'incomplete']);
const CURRENCY = 'usd';

/** Writes one line to the admin audit log. */
export async function recordAdminAction(adminEmail: string, action: string, target: string, detail = '', at = Date.now()): Promise<void> {
  await db.insert(admin_actions).values({ id: uuidv7(), at, admin_email: adminEmail, action, target, detail });
}

const Customer = z.union([z.string(), z.object({ id: z.string(), email: z.string().nullish() }).passthrough()]).nullish();
const customerOf = (c: z.infer<typeof Customer>) => (c == null ? { id: null, email: null } : typeof c === 'string' ? { id: c, email: null } : { id: c.id, email: c.email ?? null });

const SubList = z.object({
  has_more: z.boolean(),
  data: z.array(
    z
      .object({
        id: z.string(),
        status: z.string(),
        customer: Customer,
        cancel_at_period_end: z.boolean().default(false),
        current_period_end: z.number().int().optional(),
        created: z.number().int(),
        canceled_at: z.number().int().nullish(),
        collection_method: z.string().default('charge_automatically'),
        metadata: z.record(z.string(), z.string()).default({}),
        items: z.object({
          data: z.array(
            z.object({
              quantity: z.number().int().nullish(),
              current_period_end: z.number().int().optional(),
              price: z.object({ unit_amount: z.number().int().nullable(), currency: z.string(), recurring: z.object({ interval: z.string() }).nullable() }),
            }),
          ),
        }),
      })
      .passthrough(),
  ),
});

/** Account name and kind for a set of ids. */
async function accountsById(ids: string[]): Promise<Map<string, { name: string; kind: string }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: accounts.id, name: accounts.name, kind: accounts.kind }).from(accounts).where(inArray(accounts.id, unique));
  return new Map(rows.map((r) => [r.id, { name: r.name, kind: r.kind }]));
}

// ponytail: reads at most 5 pages of 100 straight from Stripe on every open; cache or page in the UI once there are more than 500.
const MAX_PAGES = 5;

/** Every subscription Stripe holds (any status), newest first, matched to our accounts through its metadata. */
export async function listSubscriptions(call: StripeCall = stripeRequest): Promise<AdminSubscription[]> {
  const out: z.infer<typeof SubList>['data'] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await call('GET', '/subscriptions', SubList, { status: 'all', limit: '100', 'expand[]': 'data.customer', starting_after: after });
    out.push(...res.data);
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1]!.id;
  }
  const names = await accountsById(out.flatMap((s) => (s.metadata.account_id ? [s.metadata.account_id] : [])));
  return out.map((s) => {
    const item = s.items.data[0];
    const account = s.metadata.account_id ? names.get(s.metadata.account_id) : undefined;
    const customer = customerOf(s.customer);
    const periodEnd = s.current_period_end ?? item?.current_period_end;
    return {
      id: s.id,
      status: s.status,
      customer_id: customer.id ?? '',
      customer_email: customer.email,
      account_id: s.metadata.account_id ?? null,
      account_name: account?.name ?? null,
      account_kind: account?.kind ?? null,
      amount: item?.price.unit_amount == null ? null : item.price.unit_amount * (item.quantity ?? 1),
      currency: item?.price.currency ?? CURRENCY,
      interval: item?.price.recurring?.interval ?? null,
      current_period_end: periodEnd === undefined ? null : periodEnd * 1000,
      cancel_at_period_end: s.cancel_at_period_end,
      created: s.created * 1000,
      canceled_at: s.canceled_at ? s.canceled_at * 1000 : null,
      collection_method: s.collection_method,
    };
  });
}

const ChargeList = z.object({
  has_more: z.boolean(),
  data: z.array(
    z
      .object({
        id: z.string(),
        created: z.number().int(),
        amount: z.number().int(),
        amount_refunded: z.number().int().default(0),
        currency: z.string(),
        status: z.string(),
        refunded: z.boolean().default(false),
        disputed: z.boolean().default(false),
        failure_message: z.string().nullish(),
        customer: Customer,
        description: z.string().nullish(),
        receipt_url: z.string().nullish(),
        billing_details: z.object({ email: z.string().nullish() }).passthrough().nullish(),
      })
      .passthrough(),
  ),
});

/** The newest payments (up to 500), with their account where the customer is one of ours, and totals per month. */
export async function listCharges(call: StripeCall = stripeRequest): Promise<AdminChargesPage> {
  if (!env.stripeEnabled) return { enabled: false, charges: [], months: [] };
  const raw: z.infer<typeof ChargeList>['data'] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await call('GET', '/charges', ChargeList, { limit: '100', 'expand[]': 'data.customer', starting_after: after });
    raw.push(...res.data);
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1]!.id;
  }
  const customerIds = [...new Set(raw.flatMap((c) => (customerOf(c.customer).id ? [customerOf(c.customer).id!] : [])))];
  const owners = customerIds.length
    ? await db
        .select({ customer: subscriptions.stripe_customer_id, account_id: subscriptions.account_id, name: accounts.name })
        .from(subscriptions)
        .leftJoin(accounts, eq(accounts.id, subscriptions.account_id))
        .where(inArray(subscriptions.stripe_customer_id, customerIds))
    : [];
  const byCustomer = new Map(owners.map((o) => [o.customer, o]));

  const charges: AdminCharge[] = raw.map((c) => {
    const customer = customerOf(c.customer);
    const owner = customer.id ? byCustomer.get(customer.id) : undefined;
    return {
      id: c.id,
      created: c.created * 1000,
      amount: c.amount,
      amount_refunded: c.amount_refunded,
      currency: c.currency,
      status: c.status,
      refunded: c.refunded,
      disputed: c.disputed,
      failure_message: c.failure_message ?? null,
      customer_id: customer.id,
      customer_email: customer.email ?? c.billing_details?.email ?? null,
      account_id: owner?.account_id ?? null,
      account_name: owner?.name ?? null,
      description: c.description ?? null,
      receipt_url: c.receipt_url ?? null,
    };
  });
  return { enabled: true, charges, months: monthTotals(charges) };
}

/** Paid, refunded and failed cents per month and currency, newest month first. Pure. */
export function monthTotals(charges: readonly Pick<AdminCharge, 'created' | 'amount' | 'amount_refunded' | 'currency' | 'status'>[]): AdminChargesPage['months'] {
  const by = new Map<string, AdminChargesPage['months'][number]>();
  for (const c of charges) {
    const month = new Date(c.created).toISOString().slice(0, 7);
    const key = `${month} ${c.currency}`;
    const row = by.get(key) ?? { month, currency: c.currency, paid: 0, refunded: 0, failed: 0 };
    if (c.status === 'succeeded') row.paid += c.amount;
    else if (c.status === 'failed') row.failed += c.amount;
    row.refunded += c.amount_refunded;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency));
}

const Refund = z.object({ id: z.string(), amount: z.number().int(), status: z.string().nullish() });

export async function refundCharge(chargeId: string, body: { amount?: number; reason: string; note: string }, adminEmail: string, call: StripeCall = stripeRequest) {
  const refund = await call('POST', '/refunds', Refund, {
    charge: chargeId,
    amount: body.amount === undefined ? undefined : String(body.amount),
    reason: body.reason,
    'metadata[admin]': adminEmail,
    'metadata[note]': body.note || undefined,
  });
  await recordAdminAction(adminEmail, 'refund', chargeId, `${refund.amount} cents (${body.reason})${body.note ? `: ${body.note}` : ''}`);
  return refund;
}

const SubBrief = z.object({ id: z.string(), status: z.string(), cancel_at_period_end: z.boolean().default(false) }).passthrough();

export async function cancelSubscription(subId: string, body: { at_period_end: boolean; note: string }, adminEmail: string, call: StripeCall = stripeRequest) {
  const sub = body.at_period_end
    ? await call('POST', `/subscriptions/${encodeURIComponent(subId)}`, SubBrief, { cancel_at_period_end: 'true', 'metadata[cancelled_by]': adminEmail })
    : await call('DELETE', `/subscriptions/${encodeURIComponent(subId)}`, SubBrief);
  await recordAdminAction(adminEmail, body.at_period_end ? 'cancel_at_period_end' : 'cancel_now', subId, body.note);
  return { status: sub.status, cancel_at_period_end: sub.cancel_at_period_end };
}

// ---- organizations ----

/** Seats and yearly price for a request: the fixed tier's, or the custom numbers typed in. */
export function planFor(body: Pick<CreateOrgBillingBody, 'tier' | 'seats' | 'yearly_cents'>): { seats: number; yearly_cents: number } {
  if (body.tier === 'custom') return { seats: body.seats!, yearly_cents: body.yearly_cents! };
  const t = ORG_TIERS[body.tier as FixedOrgTier];
  return { seats: t.seats, yearly_cents: t.yearly_cents };
}

const PriceRow = z.object({ id: z.string() });
const PriceList = z.object({ data: z.array(PriceRow) });

/** A yearly Stripe price for the plan. Fixed tiers reuse one price each (found by lookup key); custom plans get a new one. */
async function priceFor(tier: string, seats: number, yearlyCents: number, call: StripeCall): Promise<string> {
  const lookup = tier === 'custom' ? undefined : `chipperly-org-${tier}-yearly`;
  if (lookup) {
    const found = await call('GET', '/prices', PriceList, { 'lookup_keys[]': lookup, active: 'true', limit: '1' });
    if (found.data[0]) return found.data[0].id;
  }
  const price = await call('POST', '/prices', PriceRow, {
    currency: CURRENCY,
    unit_amount: String(yearlyCents),
    'recurring[interval]': 'year',
    'product_data[name]': `Chipperly organization, up to ${seats.toLocaleString('en-US')} Primary Users`,
    lookup_key: lookup,
  });
  return price.id;
}

const Link = z.object({ id: z.string(), url: z.string() });
const CustomerRow = z.object({ id: z.string() });
const NewSub = z.object({ id: z.string(), latest_invoice: z.union([z.string(), z.object({ id: z.string() }).passthrough()]).nullish() });
const Invoice = z.object({ id: z.string(), hosted_invoice_url: z.string().nullish() });

export const toBilling = (r: typeof org_billing.$inferSelect): OrgBilling => ({
  id: r.id,
  account_id: r.account_id,
  method: r.method,
  tier: r.tier,
  seats: r.seats,
  yearly_cents: r.yearly_cents,
  currency: r.currency,
  url: r.url,
  billing_email: r.billing_email,
  status: r.status,
  note: r.note,
  created_by: r.created_by,
  created_at: r.created_at,
});

/**
 * A payment link (card, yearly, no expiry) or an invoice Stripe emails now
 * (card or bank transfer, due in `days_until_due`) for one organization.
 * Both carry account_id and org_billing_id on the subscription, so the
 * webhook (lib/stripe.ts) ties the payment to the account, sets its tier and
 * seats, and marks this row paid.
 */
export async function createOrgBilling(
  accountId: string,
  body: CreateOrgBillingBody,
  adminEmail: string,
  appOrigin: string,
  call: StripeCall = stripeRequest,
): Promise<OrgBilling> {
  const [account] = await db.select({ kind: accounts.kind, name: accounts.name }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw new AppError(404, 'not_found', 'Account not found');
  if (account.kind !== 'agency') throw new AppError(409, 'not_an_org', 'Payment links and invoices here are for organization accounts');
  const [sub] = await db.select({ status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.account_id, accountId)).limit(1);
  if (sub && LIVE.has(sub.status)) throw new AppError(409, 'already_subscribed', 'This organization already has a live subscription. Cancel it first to change the plan.');

  const { seats, yearly_cents } = planFor(body);
  const id = uuidv7();
  const meta = {
    'metadata[account_id]': accountId,
    'metadata[org_billing_id]': id,
    'metadata[org_tier]': body.tier,
    'metadata[seats]': String(seats),
  };
  const subMeta = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k.replace('metadata', 'subscription_data[metadata]'), v]));
  const priceId = await priceFor(body.tier, seats, yearly_cents, call);

  let row: typeof org_billing.$inferInsert;
  const base = {
    id,
    account_id: accountId,
    method: body.method,
    tier: body.tier,
    seats,
    yearly_cents,
    currency: CURRENCY,
    stripe_price_id: priceId,
    billing_email: body.billing_email ?? null,
    status: 'open',
    note: body.note,
    created_by: adminEmail,
    created_at: Date.now(),
  };
  if (body.method === 'link') {
    const link = await call('POST', '/payment_links', Link, {
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      ...meta,
      ...subMeta,
      'after_completion[type]': 'redirect',
      'after_completion[redirect][url]': `${appOrigin}/settings/billing/?checkout=done`,
    });
    row = { ...base, stripe_payment_link_id: link.id, url: link.url };
  } else {
    const customer = await call('POST', '/customers', CustomerRow, { email: body.billing_email, name: account.name, 'metadata[account_id]': accountId });
    const created = await call('POST', '/subscriptions', NewSub, {
      customer: customer.id,
      'items[0][price]': priceId,
      collection_method: 'send_invoice',
      days_until_due: String(body.days_until_due),
      ...meta,
    });
    const invoiceId = typeof created.latest_invoice === 'string' ? created.latest_invoice : created.latest_invoice?.id;
    let url: string | null = null;
    if (invoiceId) {
      // Finalize and email it now, instead of Stripe's automatic finalize about an hour later.
      const finalized = await call('POST', `/invoices/${encodeURIComponent(invoiceId)}/finalize`, Invoice);
      await call('POST', `/invoices/${encodeURIComponent(invoiceId)}/send`, Invoice);
      url = finalized.hosted_invoice_url ?? null;
    }
    row = { ...base, stripe_subscription_id: created.id, url };
  }
  await db.insert(org_billing).values(row);
  // The plan is recorded now so the org's seats show at once; the webhook keeps them in step.
  await db.update(accounts).set({ org_tier: body.tier, seat_limit: seats }).where(eq(accounts.id, accountId));
  await recordAdminAction(adminEmail, body.method === 'link' ? 'org_payment_link' : 'org_invoice', accountId, `${body.tier} (${seats} seats, ${yearly_cents} cents/yr)${body.note ? `: ${body.note}` : ''}`);
  const [saved] = await db.select().from(org_billing).where(eq(org_billing.id, id)).limit(1);
  return toBilling(saved!);
}

const SubWithInvoice = z.object({ id: z.string(), latest_invoice: z.union([z.string(), z.object({ id: z.string() }).passthrough()]).nullish() }).passthrough();

/** Turns a payment link off, or voids an unpaid invoice and ends its subscription. A paid row cannot be withdrawn here. */
export async function withdrawOrgBilling(billingId: string, adminEmail: string, call: StripeCall = stripeRequest): Promise<OrgBilling> {
  const [row] = await db.select().from(org_billing).where(eq(org_billing.id, billingId)).limit(1);
  if (!row) throw new AppError(404, 'not_found', 'Not found');
  if (row.status !== 'open') throw new AppError(409, 'not_open', 'Only an open link or invoice can be withdrawn');
  if (row.method === 'link' && row.stripe_payment_link_id) {
    await call('POST', `/payment_links/${encodeURIComponent(row.stripe_payment_link_id)}`, Link, { active: 'false' });
  } else if (row.stripe_subscription_id) {
    const sub = await call('GET', `/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`, SubWithInvoice);
    const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
    if (invoiceId) await call('POST', `/invoices/${encodeURIComponent(invoiceId)}/void`, Invoice);
    await call('DELETE', `/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`, SubBrief);
  }
  const status = row.method === 'link' ? 'deactivated' : 'void';
  await db.update(org_billing).set({ status }).where(eq(org_billing.id, billingId));
  await recordAdminAction(adminEmail, `org_${row.method}_withdrawn`, row.account_id, billingId);
  return toBilling({ ...row, status });
}

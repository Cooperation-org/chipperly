import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AdminAccountBilling, AdminPlanOption, DiscountBody } from '@chipperly/shared/schemas/admin';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { AppError } from '../plugins/errors.js';
import { Customer, customerOf, recordAdminAction, SubBrief, type StripeCall } from './adminStripe.js';
import { priceIdsForKind, stripeRequest } from './stripe.js';

// One customer's billing for the admin site: their plan, discount and invoices,
// and the super admin's changes to them. Every Stripe call goes through `call`.

const CouponSchema = z
  .object({ percent_off: z.number().nullish(), amount_off: z.number().int().nullish(), duration: z.string(), duration_in_months: z.number().int().nullish(), name: z.string().nullish() })
  .passthrough();
// Older API versions put the coupon on the discount, newer ones under source.coupon (sometimes only as an id).
const DiscountSchema = z
  .object({
    end: z.number().int().nullish(),
    coupon: z.union([z.string(), CouponSchema]).nullish(),
    source: z.object({ coupon: z.union([z.string(), CouponSchema]).nullish() }).passthrough().nullish(),
  })
  .passthrough();
const LiveSub = z
  .object({
    id: z.string(),
    status: z.string(),
    customer: Customer,
    cancel_at_period_end: z.boolean().default(false),
    current_period_end: z.number().int().optional(),
    collection_method: z.string().default('charge_automatically'),
    discount: DiscountSchema.nullish(),
    discounts: z.array(z.union([z.string(), DiscountSchema])).nullish(),
    items: z.object({
      data: z.array(
        z.object({
          id: z.string(),
          quantity: z.number().int().nullish(),
          current_period_end: z.number().int().optional(),
          price: z.object({ id: z.string(), unit_amount: z.number().int().nullable(), currency: z.string(), recurring: z.object({ interval: z.string() }).nullable() }),
        }),
      ),
    }),
  })
  .passthrough();
const InvoiceList = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        number: z.string().nullish(),
        created: z.number().int(),
        amount_due: z.number().int(),
        amount_paid: z.number().int(),
        currency: z.string(),
        status: z.string().nullish(),
        hosted_invoice_url: z.string().nullish(),
        invoice_pdf: z.string().nullish(),
      })
      .passthrough(),
  ),
});
const PriceInfo = z.object({ id: z.string(), unit_amount: z.number().int().nullable(), currency: z.string(), recurring: z.object({ interval: z.string() }).nullable(), active: z.boolean().default(true) });
const CouponId = z.object({ id: z.string() });

/** Every plan the app sells (the STRIPE_PRICE_* settings), read from Stripe, for "Change plan". Organizations use their own tiers. */
export async function planOptions(call: StripeCall = stripeRequest): Promise<AdminPlanOption[]> {
  const out: AdminPlanOption[] = [];
  for (const kind of ['individual', 'supported', 'household'] as const) {
    for (const { plan, id } of priceIdsForKind(kind)) {
      try {
        const p = await call('GET', `/prices/${encodeURIComponent(id)}`, PriceInfo);
        if (p.active && p.unit_amount !== null) out.push({ price_id: p.id, kind, plan, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null });
      } catch {
        // A price that cannot be read is left out of the list.
      }
    }
  }
  return out;
}

export function readDiscount(sub: z.infer<typeof LiveSub>): NonNullable<AdminAccountBilling['subscription']>['discount'] {
  const d = sub.discount ?? sub.discounts?.find((x): x is z.infer<typeof DiscountSchema> => typeof x !== 'string');
  if (!d) return null;
  const coupon = typeof d.coupon === 'object' && d.coupon ? d.coupon : typeof d.source?.coupon === 'object' && d.source.coupon ? d.source.coupon : null;
  return {
    percent_off: coupon?.percent_off ?? null,
    amount_off: coupon?.amount_off ?? null,
    duration: coupon?.duration ?? 'unknown',
    months: coupon?.duration_in_months ?? null,
    ends_at: d.end ? d.end * 1000 : null,
    name: coupon?.name ?? null,
  };
}

export async function accountBilling(accountId: string, call: StripeCall = stripeRequest): Promise<AdminAccountBilling> {
  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, kind: accounts.kind, comp_until: accounts.comp_until, org_tier: accounts.org_tier, seat_limit: accounts.seat_limit })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) throw new AppError(404, 'not_found', 'Account not found');
  const base: AdminAccountBilling = { account, stripe_enabled: env.stripeEnabled, subscription: null, invoices: [], plan_options: [] };
  if (!env.stripeEnabled) return base;
  const options = account.kind === 'agency' ? [] : await planOptions(call);
  const [local] = await db.select().from(subscriptions).where(eq(subscriptions.account_id, accountId)).limit(1);
  if (!local) return { ...base, plan_options: options };
  const sub = await call('GET', `/subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`, LiveSub, { 'expand[0]': 'customer', 'expand[1]': 'discounts' });
  const item = sub.items.data[0];
  const customer = customerOf(sub.customer);
  const periodEnd = sub.current_period_end ?? item?.current_period_end;
  const invoices = await call('GET', '/invoices', InvoiceList, { customer: local.stripe_customer_id, limit: '24' });
  return {
    ...base,
    plan_options: options,
    subscription: {
      id: sub.id,
      status: sub.status,
      price_id: item?.price.id ?? null,
      amount: item?.price.unit_amount == null ? null : item.price.unit_amount * (item.quantity ?? 1),
      currency: item?.price.currency ?? 'usd',
      interval: item?.price.recurring?.interval ?? null,
      current_period_end: periodEnd === undefined ? null : periodEnd * 1000,
      cancel_at_period_end: sub.cancel_at_period_end,
      collection_method: sub.collection_method,
      customer_id: customer.id ?? local.stripe_customer_id,
      customer_email: customer.email,
      discount: readDiscount(sub),
    },
    invoices: invoices.data.map((i) => ({
      id: i.id,
      number: i.number ?? null,
      created: i.created * 1000,
      amount_due: i.amount_due,
      amount_paid: i.amount_paid,
      currency: i.currency,
      status: i.status ?? 'draft',
      url: i.hosted_invoice_url ?? null,
      pdf: i.invoice_pdf ?? null,
    })),
  };
}

/** Moves a subscription to another of the app's plans, prorated. The webhook then switches the account's kind if needed. */
export async function changePlan(subId: string, priceId: string, note: string, adminEmail: string, call: StripeCall = stripeRequest) {
  if (!(await planOptions(call)).some((o) => o.price_id === priceId)) throw new AppError(400, 'unknown_price', 'That is not one of the plans the app sells');
  const sub = await call('GET', `/subscriptions/${encodeURIComponent(subId)}`, LiveSub);
  const item = sub.items.data[0];
  if (!item) throw new AppError(409, 'no_item', 'This subscription has no plan to change');
  if (item.price.id === priceId) throw new AppError(409, 'same_plan', 'They are already on that plan');
  await call('POST', `/subscriptions/${encodeURIComponent(subId)}`, SubBrief, {
    'items[0][id]': item.id,
    'items[0][price]': priceId,
    proration_behavior: 'create_prorations',
  });
  await recordAdminAction(adminEmail, 'plan_changed', subId, `${item.price.id} to ${priceId}${note ? `: ${note}` : ''}`);
  return { ok: true as const };
}

/** A percentage off, for some months or for as long as they subscribe. Replaces any discount they had. */
export async function addDiscount(subId: string, body: DiscountBody, adminEmail: string, call: StripeCall = stripeRequest) {
  const months = body.months;
  const coupon = await call('POST', '/coupons', CouponId, {
    percent_off: String(body.percent_off),
    duration: months === null ? 'forever' : 'repeating',
    duration_in_months: months === null ? undefined : String(months),
    name: `${body.percent_off}% off${months === null ? '' : ` for ${months} month${months === 1 ? '' : 's'}`} (Chipperly team)`,
    'metadata[added_by]': adminEmail,
  });
  await call('POST', `/subscriptions/${encodeURIComponent(subId)}`, SubBrief, { 'discounts[0][coupon]': coupon.id });
  await recordAdminAction(adminEmail, 'discount_added', subId, `${body.percent_off}% ${months === null ? 'forever' : `for ${months} months`}${body.note ? `: ${body.note}` : ''}`);
  return { ok: true as const };
}

export async function removeDiscount(subId: string, adminEmail: string, call: StripeCall = stripeRequest) {
  // An empty discounts list clears it.
  await call('POST', `/subscriptions/${encodeURIComponent(subId)}`, SubBrief, { discounts: '' });
  await recordAdminAction(adminEmail, 'discount_removed', subId);
  return { ok: true as const };
}

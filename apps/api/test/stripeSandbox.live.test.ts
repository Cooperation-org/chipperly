import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { org_billing } from '../src/db/schema/subscriptions.js';
import { env } from '../src/env.js';
import { cancelSubscription, createOrgBilling, listCharges, listSubscriptions, refundCharge, withdrawOrgBilling } from '../src/lib/adminStripe.js';
import { accountBilling, addDiscount, changePlan, removeDiscount } from '../src/lib/adminAccountBilling.js';
import { applyOrgInvoicePaid, applyStripeEvent, parseStripeEvent, stripeRequest } from '../src/lib/stripe.js';

// Against Stripe's sandbox, for real: run only with STRIPE_SANDBOX=1 and the
// test-mode keys in the environment (apps/api/.env.stripe-test). Never live keys.
const live = process.env.STRIPE_SANDBOX === '1' && (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');

const Any = z.object({}).passthrough();
const Obj = z.object({ id: z.string() }).passthrough();
const EventList = z.object({ data: z.array(z.unknown()) });

async function account(kind: 'household' | 'agency') {
  const userId = uuidv7();
  const email = `sandbox-${userId}@example.com`;
  await db.insert(users).values({ id: userId, email, display_name: 'Sandbox', created_at: Date.now() });
  const id = uuidv7();
  await db.insert(accounts).values({ id, kind, name: `Sandbox ${kind} ${id.slice(-4)}`, created_at: Date.now(), owner_user_id: userId });
  await db.insert(account_members).values({ account_id: id, user_id: userId, role: 'admin' });
  return { id, email };
}

/** Feeds Stripe's own copy of an object to the webhook handler, as an event would. */
async function deliver(type: string, object: unknown) {
  return applyStripeEvent(parseStripeEvent({ id: `evt_sandbox_${uuidv7()}`, type, created: Math.floor(Date.now() / 1000), data: { object } }));
}

describe.skipIf(!live)('Stripe sandbox: the admin site against real Stripe', () => {
  const admin = 'sandbox-admin@example.com';

  it('a subscriber: listed, billing view, discount on and off, plan change, partial refund, cancel', async () => {
    expect(env.stripeEnabled).toBe(true);
    const acct = await account('household');
    const customer = await stripeRequest('POST', '/customers', Obj, { email: acct.email, payment_method: 'pm_card_visa', 'invoice_settings[default_payment_method]': 'pm_card_visa' });
    const created = await stripeRequest('POST', '/subscriptions', Obj, {
      customer: customer.id,
      'items[0][price]': env.STRIPE_PRICE_HOUSEHOLD!,
      'metadata[account_id]': acct.id,
      'expand[0]': 'latest_invoice.payments',
    });
    expect(await deliver('customer.subscription.created', await stripeRequest('GET', `/subscriptions/${created.id}`, Any))).toBe('applied');

    expect((await listSubscriptions()).find((s) => s.id === created.id)).toMatchObject({ account_id: acct.id, status: 'active', interval: 'month' });
    const charge = (await listCharges()).charges.find((c) => c.customer_id === customer.id);
    expect(charge).toMatchObject({ status: 'succeeded', account_id: acct.id });

    let view = await accountBilling(acct.id);
    expect(view.subscription).toMatchObject({ id: created.id, status: 'active', discount: null });
    expect(view.invoices.length).toBeGreaterThan(0);
    expect(view.plan_options.map((o) => o.price_id)).toContain(env.STRIPE_PRICE_HOUSEHOLD_YEARLY);

    await addDiscount(created.id, { percent_off: 50, months: 3, note: 'sandbox' }, admin);
    view = await accountBilling(acct.id);
    expect(view.subscription?.discount).toMatchObject({ percent_off: 50, duration: 'repeating', months: 3 });
    await removeDiscount(created.id, admin);
    expect((await accountBilling(acct.id)).subscription?.discount).toBeNull();

    await changePlan(created.id, env.STRIPE_PRICE_HOUSEHOLD_YEARLY!, 'sandbox', admin);
    expect((await accountBilling(acct.id)).subscription).toMatchObject({ price_id: env.STRIPE_PRICE_HOUSEHOLD_YEARLY, interval: 'year' });

    await refundCharge(charge!.id, { amount: 100, reason: 'requested_by_customer', note: 'sandbox' }, admin);
    expect((await listCharges()).charges.find((c) => c.id === charge!.id)?.amount_refunded).toBe(100);

    expect(await cancelSubscription(created.id, { at_period_end: true, note: '' }, admin)).toMatchObject({ cancel_at_period_end: true });
    expect(await cancelSubscription(created.id, { at_period_end: false, note: '' }, admin)).toMatchObject({ status: 'canceled' });
  }, 120_000);

  it('an organization: payment link made and withdrawn; an invoice sent, paid, and marked paid by the real invoice.paid event', async () => {
    const link = await account('agency');
    const bill = await createOrgBilling(link.id, { method: 'link', tier: '25', days_until_due: 30, note: 'sandbox' }, admin, 'https://app.example');
    expect(bill.url).toMatch(/^https:\/\/buy\.stripe\.com\//);
    expect((await withdrawOrgBilling(bill.id, admin)).status).toBe('deactivated');

    const org = await account('agency');
    const inv = await createOrgBilling(org.id, { method: 'invoice', tier: '100', billing_email: org.email, days_until_due: 30, note: 'sandbox' }, admin, 'https://app.example');
    expect(inv.url).toMatch(/^https:\/\/invoice\.stripe\.com\//);
    const [row] = await db.select().from(org_billing).where(eq(org_billing.id, inv.id));
    const sub = await stripeRequest('GET', `/subscriptions/${row!.stripe_subscription_id}`, z.object({ latest_invoice: z.string() }).passthrough());
    expect(await deliver('customer.subscription.created', await stripeRequest('GET', `/subscriptions/${row!.stripe_subscription_id}`, Any))).toBe('applied');
    const [acct] = await db.select({ seat_limit: accounts.seat_limit, org_tier: accounts.org_tier }).from(accounts).where(eq(accounts.id, org.id));
    expect(acct).toEqual({ seat_limit: 100, org_tier: '100' });

    await stripeRequest('POST', `/invoices/${sub.latest_invoice}/pay`, Obj, { paid_out_of_band: 'true' });
    // Stripe's own invoice.paid event for it, as the webhook would receive it.
    let event: unknown;
    for (let i = 0; i < 10 && !event; i++) {
      const events = await stripeRequest('GET', '/events', EventList, { type: 'invoice.paid', limit: '20' });
      event = events.data.find((e) => (e as { data: { object: { id: string } } }).data.object.id === sub.latest_invoice);
      if (!event) await new Promise((r) => setTimeout(r, 1500));
    }
    expect(event, 'Stripe sent invoice.paid').toBeTruthy();
    expect(await applyOrgInvoicePaid(parseStripeEvent(event))).toBe('applied');
    const [paid] = await db.select({ status: org_billing.status }).from(org_billing).where(eq(org_billing.id, inv.id));
    expect(paid?.status).toBe('paid');

    await stripeRequest('DELETE', `/subscriptions/${row!.stripe_subscription_id}`, Obj);
  }, 120_000);
});

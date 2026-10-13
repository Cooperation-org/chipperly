import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { admin_actions, org_billing } from '../src/db/schema/subscriptions.js';
import { issueTokens } from '../src/lib/tokens.js';
import { env } from '../src/env.js';
import { createOrgBilling, monthTotals, refundCharge, withdrawOrgBilling, type StripeCall } from '../src/lib/adminStripe.js';
import { applyOrgInvoicePaid, applyStripeEvent } from '../src/lib/stripe.js';

async function createUser(label: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const id = uuidv7();
  const email = `${label}-${id}@example.com`;
  await db.insert(users).values({ id, email, display_name: label, created_at: Date.now(), ...extra });
  return { id, email, token: (await issueTokens(id)).access_token };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function createOrg(ownerId: string, kind: 'agency' | 'household' = 'agency'): Promise<string> {
  const id = uuidv7();
  await db.insert(accounts).values({ id, kind, name: `Org ${id.slice(-4)}`, created_at: Date.now(), owner_user_id: ownerId });
  await db.insert(account_members).values({ account_id: id, user_id: ownerId, role: 'admin' });
  return id;
}

/** A fake Stripe that answers by path and records every call. */
function fakeStripe(answers: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; params: Record<string, string | undefined> }> = [];
  const call = (async (method: string, path: string, schema: { parse: (v: unknown) => unknown }, params: Record<string, string | undefined> = {}) => {
    calls.push({ method, path, params });
    const key = Object.keys(answers).find((k) => k === `${method} ${path}`) ?? Object.keys(answers).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) throw new Error(`unexpected Stripe call ${method} ${path}`);
    return schema.parse(answers[key]);
  }) as unknown as StripeCall;
  return { call, calls };
}

describe('admin site: roles', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('support reads people and orgs but cannot refund, cancel, bill an org or change roles; others get nothing', async () => {
    const support = await createUser('support', { is_support: true });
    const nobody = await createUser('nobody');
    const me = (await request(app, { method: 'GET', url: '/api/me', headers: auth(support.token) })).json() as { user: { is_support: boolean; is_super_admin: boolean } };
    expect(me.user).toMatchObject({ is_support: true, is_super_admin: false });

    for (const url of ['/api/admin/users', '/api/admin/orgs', '/api/admin/overview', '/api/admin/feedback', '/api/admin/actions']) {
      expect((await request(app, { method: 'GET', url, headers: auth(support.token) })).statusCode, url).toBe(200);
      expect((await request(app, { method: 'GET', url, headers: auth(nobody.token) })).statusCode, url).toBe(403);
    }
    const org = await createOrg(nobody.id);
    const writes = [
      { method: 'POST' as const, url: '/api/admin/charges/ch_123/refund', payload: {} },
      { method: 'POST' as const, url: '/api/admin/subscriptions/sub_123/cancel', payload: { at_period_end: true } },
      { method: 'POST' as const, url: `/api/admin/orgs/${org}/billing`, payload: { method: 'link', tier: '25' } },
      { method: 'PUT' as const, url: `/api/admin/users/${nobody.id}/support`, payload: { is_support: true } },
      { method: 'GET' as const, url: '/api/admin/backups', payload: undefined },
    ];
    for (const w of writes) expect((await request(app, { ...w, headers: auth(support.token) })).statusCode, w.url).toBe(403);
  });

  it('a super admin turns the support role on and it is logged', async () => {
    const boss = await createUser('boss');
    env.superAdminEmails.add(boss.email);
    const helper = await createUser('helper');
    const res = await request(app, { method: 'PUT', url: `/api/admin/users/${helper.id}/support`, headers: auth(boss.token), payload: { is_support: true } });
    expect(res.statusCode).toBe(200);
    const [row] = await db.select({ is_support: users.is_support }).from(users).where(eq(users.id, helper.id));
    expect(row?.is_support).toBe(true);
    const log = await db.select().from(admin_actions).where(eq(admin_actions.target, helper.email));
    expect(log[0]).toMatchObject({ admin_email: boss.email, action: 'support_on' });
  });
});

describe('admin site: organization billing', () => {
  it('a payment link carries the account and plan, records the tier and seats, and is logged', async () => {
    const owner = await createUser('orgowner');
    const org = await createOrg(owner.id);
    const { call, calls } = fakeStripe({
      'GET /prices': { data: [] },
      'POST /prices': { id: 'price_org25' },
      'POST /payment_links': { id: 'plink_1', url: 'https://buy.stripe.com/test_1' },
    });
    const bill = await createOrgBilling(org, { method: 'link', tier: '25', days_until_due: 30, note: 'pilot' }, 'boss@example.com', 'https://app.example', call);
    expect(bill).toMatchObject({ method: 'link', tier: '25', seats: 25, yearly_cents: 150_000, url: 'https://buy.stripe.com/test_1', status: 'open' });
    const link = calls.find((c) => c.path === '/payment_links')!;
    expect(link.params).toMatchObject({
      'line_items[0][price]': 'price_org25',
      'subscription_data[metadata][account_id]': org,
      'subscription_data[metadata][org_billing_id]': bill.id,
      'subscription_data[metadata][seats]': '25',
    });
    expect(calls.find((c) => c.path === '/prices' && c.method === 'POST')!.params).toMatchObject({ unit_amount: '150000', 'recurring[interval]': 'year', lookup_key: 'chipperly-org-25-yearly' });
    const [acct] = await db.select({ org_tier: accounts.org_tier, seat_limit: accounts.seat_limit }).from(accounts).where(eq(accounts.id, org));
    expect(acct).toEqual({ org_tier: '25', seat_limit: 25 });
    expect((await db.select().from(admin_actions).where(eq(admin_actions.target, org)))[0]?.action).toBe('org_payment_link');

    // Withdrawing turns the link off.
    const { call: call2, calls: calls2 } = fakeStripe({ 'POST /payment_links/plink_1': { id: 'plink_1', url: 'https://buy.stripe.com/test_1' } });
    expect((await withdrawOrgBilling(bill.id, 'boss@example.com', call2)).status).toBe('deactivated');
    expect(calls2[0]!.params).toEqual({ active: 'false' });
  });

  it('an invoice creates the customer and subscription, then finalizes and sends it; a custom plan uses its own numbers', async () => {
    const owner = await createUser('invoiceowner');
    const org = await createOrg(owner.id);
    const { call, calls } = fakeStripe({
      'POST /prices': { id: 'price_custom' },
      'POST /customers': { id: 'cus_1' },
      'POST /subscriptions': { id: 'sub_1', latest_invoice: 'in_1' },
      'POST /invoices/in_1/finalize': { id: 'in_1', hosted_invoice_url: 'https://invoice.stripe.com/i/1' },
      'POST /invoices/in_1/send': { id: 'in_1' },
    });
    const bill = await createOrgBilling(
      org,
      { method: 'invoice', tier: 'custom', seats: 1500, yearly_cents: 4_500_000, billing_email: 'ap@school.example', days_until_due: 45, note: '' },
      'boss@example.com',
      'https://app.example',
      call,
    );
    expect(bill).toMatchObject({ seats: 1500, yearly_cents: 4_500_000, url: 'https://invoice.stripe.com/i/1', billing_email: 'ap@school.example' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /prices', 'POST /customers', 'POST /subscriptions', 'POST /invoices/in_1/finalize', 'POST /invoices/in_1/send']);
    expect(calls[2]!.params).toMatchObject({ collection_method: 'send_invoice', days_until_due: '45', 'metadata[account_id]': org, 'metadata[org_billing_id]': bill.id });
    // Custom plans never reuse a shared price.
    expect(calls[0]!.params.lookup_key).toBeUndefined();

    // Paying the invoice marks the row paid, once.
    const paid = { id: `evt_${uuidv7()}`, type: 'invoice.paid', created: 1, data: { object: { id: 'in_1', parent: { subscription_details: { subscription: 'sub_1', metadata: { org_billing_id: bill.id } } } } } };
    expect(await applyOrgInvoicePaid(paid)).toBe('applied');
    expect(await applyOrgInvoicePaid(paid)).toBe('ignored');
    const [row] = await db.select({ status: org_billing.status }).from(org_billing).where(eq(org_billing.id, bill.id));
    expect(row?.status).toBe('paid');
  });

  it('refuses non-org accounts and orgs that already pay', async () => {
    const owner = await createUser('family');
    const family = await createOrg(owner.id, 'household');
    const { call } = fakeStripe({});
    await expect(createOrgBilling(family, { method: 'link', tier: '25', days_until_due: 30, note: '' }, 'b@example.com', 'https://x', call)).rejects.toMatchObject({ code: 'not_an_org' });

    const org = await createOrg(owner.id);
    await applyStripeEvent({
      id: `evt_${uuidv7()}`,
      type: 'customer.subscription.created',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'sub_live', customer: 'cus_x', status: 'active', metadata: { account_id: org, org_billing_id: uuidv7(), org_tier: '100', seats: '100' }, items: { data: [{ current_period_end: 2_000_000_000 }] } } },
    });
    // The webhook set the plan from the subscription's metadata.
    const [acct] = await db.select({ seat_limit: accounts.seat_limit, org_tier: accounts.org_tier }).from(accounts).where(eq(accounts.id, org));
    expect(acct).toEqual({ seat_limit: 100, org_tier: '100' });
    await expect(createOrgBilling(org, { method: 'link', tier: '25', days_until_due: 30, note: '' }, 'b@example.com', 'https://x', call)).rejects.toMatchObject({ code: 'already_subscribed' });
  });
});

describe('admin site: payments', () => {
  it('a refund goes to Stripe with who did it, and is logged', async () => {
    const { call, calls } = fakeStripe({ 'POST /refunds': { id: 're_1', amount: 500, status: 'succeeded' } });
    await refundCharge('ch_abc', { amount: 500, reason: 'requested_by_customer', note: 'double charge' }, 'boss@example.com', call);
    expect(calls[0]!.params).toMatchObject({ charge: 'ch_abc', amount: '500', 'metadata[admin]': 'boss@example.com' });
    const [log] = await db.select().from(admin_actions).where(eq(admin_actions.target, 'ch_abc'));
    expect(log).toMatchObject({ action: 'refund', detail: '500 cents (requested_by_customer): double charge' });
  });

  it('month totals add paid, refunded and failed per month and currency', () => {
    const jan = Date.UTC(2026, 0, 15);
    const feb = Date.UTC(2026, 1, 2);
    expect(
      monthTotals([
        { created: jan, amount: 1000, amount_refunded: 0, currency: 'usd', status: 'succeeded' },
        { created: jan, amount: 1500, amount_refunded: 500, currency: 'usd', status: 'succeeded' },
        { created: feb, amount: 1000, amount_refunded: 0, currency: 'usd', status: 'failed' },
      ]),
    ).toEqual([
      { month: '2026-02', currency: 'usd', paid: 0, refunded: 0, failed: 1000 },
      { month: '2026-01', currency: 'usd', paid: 2500, refunded: 500, failed: 0 },
    ]);
  });
});

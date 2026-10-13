import type { FastifyInstance } from 'fastify';
import { desc, eq, inArray, isNull, and, sql as dsql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CancelSubscriptionBodySchema,
  CreateOrgBillingBodySchema,
  RefundBodySchema,
  type AdminAction,
  type AdminChargesPage,
  type AdminOrg,
  type AdminSubscription,
  type OrgBilling,
} from '@chipperly/shared/schemas/admin';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import { db } from '../db/client.js';
import { accounts, users } from '../db/schema/accounts.js';
import { profiles } from '../db/schema/profiles.js';
import { admin_actions, org_billing, subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { cancelSubscription, createOrgBilling, listCharges, listSubscriptions, refundCharge, toBilling, withdrawOrgBilling } from '../lib/adminStripe.js';
import { siteOrigin } from '../lib/emailTemplate.js';
import { orgOwnerPending } from '../lib/orgOwner.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { adminEmail, requireAdminRead, requireSuperAdmin } from './admin.js';

const StripeId = z.object({ id: z.string().regex(/^[a-z]{2,4}_[A-Za-z0-9]+$/) });

/** The admin site's money screens: subscriptions, payments, refunds, cancels, organization billing. */
export default async function adminBillingRoutes(app: FastifyInstance): Promise<void> {
  const read = { preHandler: [requireUser, requireAdminRead] };
  const write = { preHandler: [requireUser, requireSuperAdmin] };
  const needStripe = () => {
    if (!env.stripeEnabled) throw new AppError(409, 'stripe_off', 'Stripe is not set up on this server');
  };

  app.get('/admin/subscriptions', read, async (): Promise<{ enabled: boolean; subscriptions: AdminSubscription[] }> =>
    env.stripeEnabled ? { enabled: true, subscriptions: await listSubscriptions() } : { enabled: false, subscriptions: [] },
  );

  app.get('/admin/charges', read, async (): Promise<AdminChargesPage> => listCharges());

  app.post('/admin/charges/:id/refund', write, async (request) => {
    needStripe();
    const { id } = StripeId.parse(request.params);
    return refundCharge(id, RefundBodySchema.parse(request.body ?? {}), await adminEmail(request));
  });

  app.post('/admin/subscriptions/:id/cancel', write, async (request) => {
    needStripe();
    const { id } = StripeId.parse(request.params);
    return cancelSubscription(id, CancelSubscriptionBodySchema.parse(request.body ?? {}), await adminEmail(request));
  });

  app.get('/admin/orgs', read, async (): Promise<{ orgs: AdminOrg[] }> => {
    const rows = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        created_at: accounts.created_at,
        owner_email: users.email,
        org_tier: accounts.org_tier,
        seat_limit: accounts.seat_limit,
        comp_until: accounts.comp_until,
        subscription_status: subscriptions.status,
        current_period_end: subscriptions.current_period_end,
      })
      .from(accounts)
      .leftJoin(users, eq(users.id, accounts.owner_user_id))
      .leftJoin(subscriptions, eq(subscriptions.account_id, accounts.id))
      .where(eq(accounts.kind, 'agency'))
      .orderBy(desc(accounts.created_at));
    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await db
          .select({ account_id: profiles.account_id, n: dsql<number>`count(*)::int` })
          .from(profiles)
          .where(and(inArray(profiles.account_id, ids), isNull(profiles.deleted_at)))
          .groupBy(profiles.account_id)
      : [];
    const bills = ids.length ? await db.select().from(org_billing).where(inArray(org_billing.account_id, ids)).orderBy(desc(org_billing.created_at)) : [];
    const n = new Map(counts.map((c) => [c.account_id, c.n]));
    const pending = new Map(await Promise.all(ids.map(async (id) => [id, await orgOwnerPending(id)] as const)));
    return {
      orgs: rows.map((r) => ({
        ...r,
        primary_users: n.get(r.id) ?? 0,
        owner_invite_pending: pending.get(r.id) ?? false,
        billing: bills.filter((b) => b.account_id === r.id).map(toBilling),
      })),
    };
  });

  app.post('/admin/orgs/:accountId/billing', write, async (request): Promise<OrgBilling> => {
    needStripe();
    const { accountId } = z.object({ accountId: uuidSchema }).parse(request.params);
    return createOrgBilling(accountId, CreateOrgBillingBodySchema.parse(request.body ?? {}), await adminEmail(request), siteOrigin());
  });

  app.post('/admin/org-billing/:id/withdraw', write, async (request): Promise<OrgBilling> => {
    needStripe();
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    return withdrawOrgBilling(id, await adminEmail(request));
  });

  app.get('/admin/actions', read, async (): Promise<{ actions: AdminAction[] }> => ({
    // ponytail: newest 300; page it when the log outgrows that.
    actions: await db.select().from(admin_actions).orderBy(desc(admin_actions.at)).limit(300),
  }));
}

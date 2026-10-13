import { z } from 'zod';
import { ORG_TIER_KEYS } from '../constants/orgTiers.js';

/** Who may open the admin site: super admins change things, support only looks. */
export type AdminRole = 'super' | 'support';

/** GET /admin/subscriptions: read live from Stripe, matched to our accounts. */
export interface AdminSubscription {
  id: string;
  status: string;
  customer_id: string;
  customer_email: string | null;
  account_id: string | null;
  account_name: string | null;
  account_kind: string | null;
  /** Cents per interval, after the first item's quantity. */
  amount: number | null;
  currency: string;
  interval: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  created: number;
  /** charge_automatically (card) or send_invoice. */
  collection_method: string;
}

/** GET /admin/charges: one payment as Stripe sees it. */
export interface AdminCharge {
  id: string;
  created: number;
  amount: number;
  amount_refunded: number;
  currency: string;
  /** succeeded | pending | failed */
  status: string;
  refunded: boolean;
  disputed: boolean;
  failure_message: string | null;
  customer_id: string | null;
  customer_email: string | null;
  account_id: string | null;
  account_name: string | null;
  description: string | null;
  receipt_url: string | null;
}

export interface AdminChargesPage {
  enabled: boolean;
  /** The newest 500 at most. */
  charges: AdminCharge[];
  /** Totals of those charges per month (YYYY-MM) and currency, in cents. */
  months: Array<{ month: string; currency: string; paid: number; refunded: number; failed: number }>;
}

export const RefundBodySchema = z.object({
  /** Cents; absent = refund what is left of the charge. */
  amount: z.number().int().positive().optional(),
  reason: z.enum(['requested_by_customer', 'duplicate', 'fraudulent']).default('requested_by_customer'),
  note: z.string().trim().max(300).default(''),
});
export type RefundBody = z.infer<typeof RefundBodySchema>;

export const CancelSubscriptionBodySchema = z.object({
  /** true = at the end of the paid period; false = now. */
  at_period_end: z.boolean(),
  note: z.string().trim().max(300).default(''),
});
export type CancelSubscriptionBody = z.infer<typeof CancelSubscriptionBodySchema>;

export const OrgTierSchema = z.enum(ORG_TIER_KEYS);

/** POST /admin/orgs/:accountId/billing: a payment link or an invoice for one organization. */
export const CreateOrgBillingBodySchema = z
  .object({
    method: z.enum(['link', 'invoice']),
    tier: OrgTierSchema,
    /** Only for tier custom. */
    seats: z.number().int().min(1).max(100_000).optional(),
    /** Only for tier custom: the yearly price in cents. */
    yearly_cents: z.number().int().min(100).max(100_000_000).optional(),
    /** Invoice only: where Stripe sends it. */
    billing_email: z.string().trim().toLowerCase().email().max(200).optional(),
    days_until_due: z.number().int().min(1).max(90).default(30),
    note: z.string().trim().max(300).default(''),
  })
  .refine((b) => b.tier !== 'custom' || (b.seats !== undefined && b.yearly_cents !== undefined), {
    message: 'A custom plan needs the number of Primary Users and the yearly price',
  })
  .refine((b) => b.method !== 'invoice' || b.billing_email !== undefined, { message: 'An invoice needs an email to send it to' });
export type CreateOrgBillingBody = z.infer<typeof CreateOrgBillingBodySchema>;

/** One payment link or invoice made for an organization. */
export interface OrgBilling {
  id: string;
  account_id: string;
  method: 'link' | 'invoice';
  tier: string;
  seats: number;
  yearly_cents: number;
  currency: string;
  /** The link to send (payment link), or Stripe's hosted invoice page. */
  url: string | null;
  billing_email: string | null;
  /** open | paid | deactivated | void */
  status: string;
  note: string;
  created_by: string;
  created_at: number;
}

/** GET /admin/orgs: every organization account with its plan and billing. */
export interface AdminOrg {
  id: string;
  name: string;
  created_at: number;
  owner_email: string | null;
  org_tier: string | null;
  seat_limit: number | null;
  primary_users: number;
  subscription_status: string | null;
  current_period_end: number | null;
  comp_until: number | null;
  billing: OrgBilling[];
}

/** GET /admin/actions: what admins did that touched money or data. */
export interface AdminAction {
  id: string;
  at: number;
  admin_email: string;
  action: string;
  target: string;
  detail: string;
}

export const SetSupportBodySchema = z.object({ is_support: z.boolean() });

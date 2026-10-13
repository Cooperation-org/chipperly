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
  /** When it was cancelled, for the cancellations chart. */
  canceled_at: number | null;
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
  /** Made from the admin site and the owner has not accepted the invite yet. */
  owner_invite_pending: boolean;
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

// ---- growth (trials and conversions) ----

/** GET /admin/insights: trials ending soon and how many trials became paying, from our database. */
export interface AdminInsights {
  trials_ending: Array<{
    user_id: string;
    email: string;
    display_name: string;
    trial_ends_at: number;
    last_seen_at: number | null;
    profiles: number;
    accounts: Array<{ id: string; name: string; kind: string }>;
  }>;
  /** People whose trial has ended (not counting super admins or support). */
  trials_ended: number;
  /** Accounts that have ever paid (a subscription that reached active). */
  paying_accounts: number;
  /** Accounts on a live subscription now. */
  active_subscriptions: number;
  /** Accounts with free access given by hand. */
  comp_accounts: number;
}

// ---- failed payments ----

/** GET /admin/failed-payments: subscriptions whose card failed, and invoices past their due date. */
export interface AdminFailedPayment {
  kind: 'subscription' | 'invoice';
  /** Stripe subscription or invoice id. */
  id: string;
  account_id: string | null;
  account_name: string | null;
  customer_email: string | null;
  amount: number | null;
  currency: string;
  status: string;
  /** When it became due or the period it failed for (ms). */
  since: number | null;
  /** Stripe's own page for paying an invoice; null for a card on a subscription. */
  pay_url: string | null;
  /** The last time an admin sent a reminder, from the audit log. */
  reminded_at: number | null;
}

// ---- two-step sign-in ----

export interface TwoStepStatus {
  /** False when the server does not ask for it (tests, local). */
  required: boolean;
  enrolled: boolean;
}

/** POST /admin/2fa/setup: a new secret to scan. Not saved until a code from it is confirmed. */
export interface TwoStepSetup {
  secret: string;
  otpauth_url: string;
}

export const TwoStepCodeBodySchema = z.object({
  code: z.string().trim().min(6).max(20),
});

/** The proof sent on every admin request as the X-Admin-Step header after a code was accepted. */
export interface TwoStepPass {
  token: string;
  expires_at: number;
  /** Only right after setup: shown once. */
  recovery_codes?: string[];
}

// ---- waitlist (lives on the website) ----

export interface AdminWaitlistEntry {
  email: string;
  name: string | null;
  role: string | null;
  source: string | null;
  created_at: number;
  invited_at: number | null;
  /** True when someone with this email already has an app account. */
  has_account: boolean;
}

export const SendBetaCodeBodySchema = z.object({ emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(200) });

// ---- email log ----

export interface AdminEmail {
  id: string;
  at: number;
  subject: string;
  /** Our send result: sent, failed, or logged (no mail provider on this server). */
  result: string;
  /** Resend's latest event when it could be read: delivered, bounced, opened, ... */
  last_event: string | null;
}

// ---- app error reports ----

export interface AdminClientErrorGroup {
  message: string;
  count: number;
  first_at: number;
  last_at: number;
  paths: string[];
  commits: string[];
  /** The newest stack for this message. */
  stack: string | null;
  user_agent: string | null;
}

// ---- organizations created for a customer ----

export const CreateOrgBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  owner_name: z.string().trim().min(1).max(100),
  owner_email: z.string().trim().toLowerCase().email().max(200),
  /** Optional: bill it right away, same body as POST /admin/orgs/:id/billing. */
  billing: z.lazy(() => CreateOrgBillingBodySchema).optional(),
});
export type CreateOrgBody = z.infer<typeof CreateOrgBodySchema>;

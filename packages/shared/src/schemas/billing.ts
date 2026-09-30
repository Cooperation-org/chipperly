import { z } from 'zod';
import { AccountKind } from './account.js';
import { msTimestampSchema, uuidSchema } from './common.js';

export const TRIAL_DAYS = 21;

/** "Remind me to check this child's routines": every 1 to 30 days (0 = off), at this local hour. */
export const ReviewReminderSchema = z.object({
  every_days: z.number().int().min(0).max(30),
  hour: z.number().int().min(0).max(23),
});
export type ReviewReminder = z.infer<typeof ReviewReminderSchema>;
export const DEFAULT_REVIEW_REMINDER: ReviewReminder = { every_days: 7, hour: 19 };

export const TimeZoneBodySchema = z.object({ time_zone: z.string().min(1).max(64) });

export const PromoCodeSchema = z.object({
  code: z.string(),
  percent_off: z.number().int().min(1).max(100).nullable(),
  applies_to: z.enum(['annual', 'any']),
  valid_from: msTimestampSchema,
  valid_until: msTimestampSchema,
  active: z.boolean(),
  /** Everyone who signs up inside the dates gets their own code under this offer. */
  auto_issue: z.boolean(),
  note: z.string().nullable(),
  created_at: msTimestampSchema,
  /** How many people have a code under it. */
  issued: z.number().int(),
});
export type PromoCode = z.infer<typeof PromoCodeSchema>;

export const UpsertPromoCodeBodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .transform((c) => c.toUpperCase()),
  percent_off: z.number().int().min(1).max(100).nullable(),
  applies_to: z.enum(['annual', 'any']),
  valid_from: msTimestampSchema,
  valid_until: msTimestampSchema,
  active: z.boolean(),
  auto_issue: z.boolean(),
  note: z.string().max(200).nullable(),
});
export type UpsertPromoCodeBody = z.infer<typeof UpsertPromoCodeBodySchema>;

export const AdminUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  display_name: z.string(),
  created_at: msTimestampSchema,
  email_verified: z.boolean(),
  trial_ends_at: msTimestampSchema,
  /** Their own early access code, if they have one. */
  personal_code: z.string().nullable(),
  account_kinds: z.array(z.string()),
  children: z.number().int(),
  devices: z.number().int(),
  last_seen_at: msTimestampSchema.nullable(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminOverviewSchema = z.object({
  users: z.number().int(),
  signups_7d: z.number().int(),
  signups_30d: z.number().int(),
  active_7d: z.number().int(),
  children: z.number().int(),
  accounts_by_kind: z.record(z.string(), z.number().int()),
  trials_active: z.number().int(),
  trials_ended: z.number().int(),
  promo_claims: z.number().int(),
  /** Sign-ups per day, oldest first, for the last 30 days. */
  signups_by_day: z.array(z.object({ day: z.string(), count: z.number().int() })),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;

export const IssueCodeBodySchema = z.object({ offer: z.string().min(1) });

export const ExtendTrialBodySchema = z.object({ days: z.number().int().min(1).max(365) });

/** Stripe's subscription statuses, stored as-is. */
export const SubscriptionStatus = z.enum([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

/**
 * GET /billing: what the billing screen shows for the active account.
 * The route 404s entirely when the server has no Stripe keys, so the web
 * hides the upgrade path on a 404. `price` is read live from Stripe (the
 * owner sets it there); it is null when no price is configured for this
 * account kind, in which case `checkout_available` is false.
 */
export const BillingStatusSchema = z.object({
  kind: AccountKind,
  checkout_available: z.boolean(),
  price: z.object({ amount: z.number().int(), currency: z.string(), interval: z.string().nullable() }).nullable(),
  subscription: z
    .object({
      status: SubscriptionStatus,
      current_period_end: msTimestampSchema.nullable(),
      cancel_at_period_end: z.boolean(),
    })
    .nullable(),
  /** Only an account admin can start checkout or open the portal. */
  can_manage: z.boolean(),
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

/** POST /billing/checkout and POST /billing/portal: send the browser here. */
export const BillingRedirectSchema = z.object({ url: z.string().url() });
export type BillingRedirect = z.infer<typeof BillingRedirectSchema>;

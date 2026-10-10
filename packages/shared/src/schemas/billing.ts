import { z } from 'zod';
import { AccountKind } from './account.js';
import { msTimestampSchema, uuidSchema } from './common.js';

export const TRIAL_DAYS = 21;
/** After a trial or paid period ends, everything keeps working this long before caregiver-side creation pauses. */
export const GRACE_DAYS = 7;

/**
 * Where an account stands. Only `lapsed` pauses anything: creating new
 * caregiver content (routines, rewards, stories, children, invites, uploads).
 * Reading, exporting, editing, completing, the child view and offline use never pause.
 * `open` = billing is off, or this kind of account cannot check out: nothing ever pauses.
 */
export const AccessState = z.enum(['open', 'subscribed', 'trial', 'grace', 'lapsed']);
export type AccessState = z.infer<typeof AccessState>;

export const AccessSchema = z.object({
  state: AccessState,
  /** Trial end (trial/grace) or the end of the last paid period (grace/lapsed); null otherwise. */
  ended_at: msTimestampSchema.nullable(),
  /** When creation pauses if nothing changes (trial/grace); the day it paused (lapsed). */
  pauses_at: msTimestampSchema.nullable(),
  write_paused: z.boolean(),
});
export type Access = z.infer<typeof AccessSchema>;

/** The caregiver's early access discount as it applies to the plan they would buy. */
export const BillingDiscountSchema = z.object({
  code: z.string(),
  percent_off: z.number().int().min(1).max(100),
  applies_to: z.enum(['annual', 'any']),
  /** False when the offer is annual-only and this account's price is not yearly. */
  applicable: z.boolean(),
});
export type BillingDiscount = z.infer<typeof BillingDiscountSchema>;

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
  /** Set when a super admin closed this person's sign-in; they can be erased 30 days after it. */
  deactivated_at: msTimestampSchema.nullable().default(null),
  /** The accounts they belong to, so free access can be given to the right one. */
  accounts: z
    .array(z.object({ id: uuidSchema, name: z.string(), kind: z.string(), role: z.string(), comp_until: msTimestampSchema.nullable() }))
    .default([]),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/** How long a closed sign-in is kept before it may be erased for good. */
export const ERASE_AFTER_DAYS = 30;

/** PATCH /admin/users/:id. Only what is sent changes. */
export const AdminEditUserBodySchema = z.object({
  display_name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  email_verified: z.boolean().optional(),
});
export type AdminEditUserBody = z.infer<typeof AdminEditUserBodySchema>;

/** DELETE /admin/users/:id: the email is typed again, so the wrong row cannot be erased by a slip. */
export const AdminEraseUserBodySchema = z.object({ confirm_email: z.string().trim().toLowerCase() });

/** PUT /admin/accounts/:id/comp. `until: null` takes the free access away. */
export const AdminCompBodySchema = z.object({
  until: msTimestampSchema.nullable(),
  note: z.string().trim().max(200).nullable().default(null),
});
export type AdminCompBody = z.infer<typeof AdminCompBodySchema>;

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

/** GET /admin/payments: every subscription, and the newest webhook events Stripe sent us. */
export interface AdminPayments {
  /** False when the server has no Stripe keys. */
  enabled: boolean;
  subscriptions: Array<{
    account_id: string;
    account_name: string | null;
    kind: string | null;
    status: string;
    current_period_end: number | null;
    cancel_at_period_end: boolean;
    updated_at: number;
  }>;
  events: Array<{
    id: string;
    type: string;
    received_at: number;
    /** applied | ignored, or null for an event from before the log existed. */
    result: string | null;
    status: string | null;
    account_name: string | null;
  }>;
}

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
/** A kind can have two prices in Stripe: the default one, and a yearly one beside it. */
export const BillingPlan = z.enum(['default', 'yearly']);
export type BillingPlan = z.infer<typeof BillingPlan>;

const PriceShape = z.object({ amount: z.number().int(), currency: z.string(), interval: z.string().nullable() });

export const BillingStatusSchema = z.object({
  kind: AccountKind,
  checkout_available: z.boolean(),
  /** The default price. Kept for older screens; `prices` lists every plan that can be bought. */
  price: PriceShape.nullable(),
  prices: z.array(PriceShape.extend({ plan: BillingPlan })).default([]),
  subscription: z
    .object({
      status: SubscriptionStatus,
      current_period_end: msTimestampSchema.nullable(),
      cancel_at_period_end: z.boolean(),
    })
    .nullable(),
  /** Only an account admin can start checkout or open the portal. */
  can_manage: z.boolean(),
  access: AccessSchema,
  discount: BillingDiscountSchema.nullable(),
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

/** POST /billing/checkout. No body means the default plan. */
export const BillingCheckoutBodySchema = z.object({ plan: BillingPlan.default('default') });
export type BillingCheckoutBody = z.infer<typeof BillingCheckoutBodySchema>;

/** POST /billing/checkout and POST /billing/portal: send the browser here. */
export const BillingRedirectSchema = z.object({ url: z.string().url() });
export type BillingRedirect = z.infer<typeof BillingRedirectSchema>;

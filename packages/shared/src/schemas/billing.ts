import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

export const TRIAL_DAYS = 21;

export const ClaimPromoBodySchema = z.object({ code: z.string().trim().min(1).max(40) });
export type ClaimPromoBody = z.infer<typeof ClaimPromoBodySchema>;

/** "Remind me to check this child's routines": every 3 or 7 days (0 = off), at this local hour. */
export const ReviewReminderSchema = z.object({
  every_days: z.union([z.literal(0), z.literal(3), z.literal(7)]),
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
  note: z.string().nullable(),
  created_at: msTimestampSchema,
  /** How many people claimed it. */
  claims: z.number().int(),
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
  promo_code: z.string().nullable(),
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

export const ExtendTrialBodySchema = z.object({ days: z.number().int().min(1).max(365) });

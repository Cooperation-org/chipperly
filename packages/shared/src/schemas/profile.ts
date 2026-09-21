import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

/** SOW Q1, decided: per profile, whether redeeming a reward subtracts its cost or empties the board. */
export const RedeemModeSchema = z.enum(['subtract', 'reset']);
export type RedeemMode = z.infer<typeof RedeemModeSchema>;

/**
 * A time-boxed exception to app blocking: `package_name` stays allowed
 * until `allowed_until`, on top of (not instead of) `allowed_app_packages`'s
 * permanent allow-list. Expired entries are inert everywhere that reads
 * them (native ChipperlyBlockService, AppBlockingScreen's countdown) rather
 * than being actively pruned, so a stale entry left behind by a caregiver
 * going offline mid-grant can never re-arm itself.
 */
export const TimedAppAllowanceSchema = z.object({
  package_name: z.string(),
  allowed_until: msTimestampSchema,
});
export type TimedAppAllowance = z.infer<typeof TimedAppAllowanceSchema>;

/**
 * Per-profile settings (technical-plan.md section 5). Existing rows still
 * hold `{}`; every field here is optional so old rows keep parsing.
 */
export const ProfileSettingsSchema = z
  .object({
    redeem_mode: RedeemModeSchema.optional(),
    /** Attitude-bonus idea, first slice: color the chip board by the Chipper Chart level a chip was earned with. Off by default. */
    chips_by_attitude: z.boolean().optional(),
    /** Standing goal for the day ("stay on task") and its reward; owner's doc, My Day 9. Shown in the Chips tab's "by day" view. */
    day_goal_text: z.string().nullable().optional(),
    day_goal_reward_id: uuidSchema.nullable().optional(),
    /** Optional chip budget for the day reward ("pick a reward up to 10 chips"). */
    day_goal_chips: z.number().int().positive().nullable().optional(),
    /** Child view may change the location's working-for reward (owner's doc, EI 2). Default true. */
    child_picks_reward: z.boolean().optional(),
    /** Child view may redeem an affordable reward from the free-time sheet (owner's doc, EI 6). Default true. */
    child_redeems: z.boolean().optional(),
    /**
     * Android app-blocking (accessibility-service based): whether it's on
     * for this profile at all, and which installed packages stay allowed
     * (plus Chipperly itself, always implicitly allowed). Off/empty by
     * default. Toggling this from any device -- including a caregiver's own
     * laptop browser -- reaches the child's device through the same sync
     * pull every other profile setting already uses; no separate push
     * channel needed.
     */
    child_mode_active: z.boolean().optional(),
    allowed_app_packages: z.array(z.string()).optional(),
    /** Apps allowed for a caregiver-granted window (e.g. "YouTube for 1 hour"), see TimedAppAllowanceSchema. */
    timed_app_allowances: z.array(TimedAppAllowanceSchema).optional(),
  })
  .partial();
export type ProfileSettings = z.infer<typeof ProfileSettingsSchema>;

/**
 * `profiles` is account-scoped, not profile-scoped, so it does not extend
 * `SyncColumnsSchema` (which carries a `profile_id` partition key). It is
 * still synced read-only through `/sync/pull` and carries the same
 * `version` / `client_updated_at` / `updated_by` / `deleted_at` columns.
 */
export const ProfileSchema = z.object({
  id: uuidSchema,
  account_id: uuidSchema,
  name: z.string().min(1),
  avatar_emoji: z.string().nullable(),
  avatar_photo_id: uuidSchema.nullable(),
  share_token: z.string().nullable(),
  first_then_activity_id: uuidSchema.nullable(),
  first_then_reward_id: uuidSchema.nullable(),
  settings: ProfileSettingsSchema,
  version: z.number().int().nonnegative(),
  client_updated_at: msTimestampSchema,
  updated_by: uuidSchema,
  deleted_at: msTimestampSchema.nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

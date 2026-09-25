import { z } from 'zod';
import { isoDateSchema, msTimestampSchema, uuidSchema } from './common.js';

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
/**
 * Where today's First-Then stands, so every device shows the same: FIRST is
 * done (the row exists) and whether the child has asked for THEN. Only counts
 * for `date` and this exact pair; a new day or a new pair reads as not done.
 * Written server-side by POST /profiles/:id/first-then, because a locked
 * child device can't push the profile row.
 */
export const FirstThenProgressSchema = z.object({
  date: isoDateSchema,
  first_id: uuidSchema,
  then_id: uuidSchema,
  asked: z.boolean(),
});
export type FirstThenProgress = z.infer<typeof FirstThenProgressSchema>;

export const FirstThenProgressBodySchema = z.object({ progress: FirstThenProgressSchema.nullable() });
export type FirstThenProgressBody = z.infer<typeof FirstThenProgressBodySchema>;

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
    /** Minutes of timer that start when the child asks for the First-Then reward (a park visit, 30 min). Null/absent: no timer (default). */
    first_then_timer_minutes: z.number().int().positive().max(240).nullable().optional(),
    first_then_progress: FirstThenProgressSchema.nullable().optional(),
    /** Standing goal for the day ("stay on task") and its reward; owner's doc, My Day 9. Shown in the Chips tab's "by day" view. */
    day_goal_text: z.string().nullable().optional(),
    day_goal_reward_id: uuidSchema.nullable().optional(),
    /** Optional chip budget for the day reward ("pick a reward up to 10 chips"). */
    day_goal_chips: z.number().int().positive().nullable().optional(),
    /** Child view may change the location's working-for reward (owner's doc, EI 2). Default true. */
    child_picks_reward: z.boolean().optional(),
    /** Child view may redeem an affordable reward from the free-time sheet (owner's doc, EI 6). Default true. */
    child_redeems: z.boolean().optional(),
    /** Whether the child uses Chipperly themselves (child view, lock, rewards they redeem). False: the app is a tool for the adults only for this child. Default true. */
    child_uses_app: z.boolean().optional(),
    /** High-priority push to the caregivers' phones when the child is ready for a reward (routes/accounts.ts reward-request). Default true. */
    reward_alerts: z.boolean().optional(),
    /** How the child view opens: today's list (default) or a home of big picture tiles, like the owner's beta dashboard. Set by the caregiver. */
    child_layout: z.enum(['list', 'tiles']).optional(),
    /** Child view may put today's tasks in their own order (owner, 25 Sept 2026: giving the child a feeling of control). Default false. */
    child_reorders: z.boolean().optional(),
    /** Child view reads tasks and steps aloud: a speaker button on each, and "<name>, done!" when ticked. Set by the team. Default false. */
    read_aloud: z.boolean().optional(),
    /**
     * Child view in high contrast for cortical visual impairment (CVI):
     * black background, white text, bright yellow outlines and buttons,
     * thick borders. Set by the team. Default false.
     */
    high_contrast: z.boolean().optional(),
    /** Child view shows bigger pictures and fewer words (dyslexic readers, early readers). Set by the team. Default false. */
    picture_mode: z.boolean().optional(),
    /** Extra chips (reason 'routine') when a routine is finished in one go from its own row, without ticking the steps one by one. Null/absent: off. */
    routine_bonus_chips: z.number().int().positive().max(10).nullable().optional(),
    /**
     * "Phone is resting": every app blocked, Chipperly shows only a resting
     * screen, and the notification bar stays usable (Wi-Fi, data). Mirrored
     * into the device's own storage (AppBlockerPlugin.setResting) so it holds
     * through a reboot with no network. Ended by the caregiver's PIN on the
     * device or a remote Wake.
     */
    resting: z.boolean().optional(),
    /** Whole-phone free time: no app blocking until this moment (a whole-phone screen-time reward, or a caregiver's "Free phone"). */
    unrestricted_until: msTimestampSchema.nullable().optional(),
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

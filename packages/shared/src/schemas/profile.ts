import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

/** SOW Q1, decided: per profile, whether redeeming a reward subtracts its cost or empties the board. */
export const RedeemModeSchema = z.enum(['subtract', 'reset']);
export type RedeemMode = z.infer<typeof RedeemModeSchema>;

/**
 * Per-profile settings (technical-plan.md section 5). Existing rows still
 * hold `{}`; every field here is optional so old rows keep parsing.
 */
export const ProfileSettingsSchema = z
  .object({
    redeem_mode: RedeemModeSchema.optional(),
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

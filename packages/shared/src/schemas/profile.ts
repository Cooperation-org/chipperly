import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

/**
 * Chipper chart, screentime control and timer defaults live here until they
 * need their own tables (technical-plan.md section 5). All optional: an
 * absent key means "use the app default".
 */
export const ProfileSettingsSchema = z
  .object({
    attitude_chart_enabled: z.boolean(),
    screentime_control_enabled: z.boolean(),
    timer_default_minutes: z.number().int().positive().nullable(),
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

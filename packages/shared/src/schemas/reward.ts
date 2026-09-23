import { z } from 'zod';
import { SyncColumnsSchema, uuidSchema } from './common.js';

export const RewardSchema = SyncColumnsSchema.extend({
  name: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  chip_cost: z.number().int().nonnegative().nullable(),
  /** Location this reward belongs to; null means "everywhere". */
  location_id: uuidSchema.nullable(),
  /** True = free-time choice board tile, costs nothing. */
  always_available: z.boolean(),
  position: z.number().int(),
  /**
   * Screen time this reward buys: redeeming it grants each app in
   * `screen_time_packages` this many minutes as a timed app allowance
   * (profile.ts TimedAppAllowanceSchema), stacked onto any time still left.
   * The server grants it (routes/sync.ts) when the redeem row lands, so a
   * locked child device never has to write profile settings itself.
   * Optional so rows written before these columns existed still parse.
   */
  screen_time_minutes: z.number().int().positive().nullable().optional(),
  /** Android package names; empty or null means no app is chosen yet, so redeeming grants nothing. */
  screen_time_packages: z.array(z.string()).nullable().optional(),
  /** True: redeeming frees the whole phone for `screen_time_minutes` (profile unrestricted_until) instead of the chosen apps. */
  screen_time_whole_phone: z.boolean().nullable().optional(),
});
export type Reward = z.infer<typeof RewardSchema>;

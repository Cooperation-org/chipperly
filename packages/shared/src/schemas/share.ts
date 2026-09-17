import { z } from 'zod';
import { hhmmSchema, msTimestampSchema, uuidSchema } from './common.js';
import { PartOfDay } from './schedule.js';

export const ShareScheduleItemSchema = z.object({
  id: uuidSchema,
  activity_name: z.string(),
  activity_emoji: z.string().nullable(),
  start_time: hhmmSchema.nullable(),
  part_of_day: PartOfDay.nullable(),
  completed_at: msTimestampSchema.nullable(),
});
export type ShareScheduleItem = z.infer<typeof ShareScheduleItemSchema>;

export const ShareWorkingForSchema = z.object({
  name: z.string(),
  emoji: z.string().nullable(),
  chip_cost: z.number().int().nonnegative().nullable(),
});
export type ShareWorkingFor = z.infer<typeof ShareWorkingForSchema>;

/**
 * Public, read-only payload behind `/share/:token` (S34). Nothing beyond
 * today's list, chip balance and the working-for reward.
 */
export const ShareViewSchema = z.object({
  profile_name: z.string(),
  profile_emoji: z.string().nullable(),
  items: z.array(ShareScheduleItemSchema),
  chip_balance: z.number().int(),
  working_for_reward: ShareWorkingForSchema.nullable(),
  updated_at: msTimestampSchema,
});
export type ShareView = z.infer<typeof ShareViewSchema>;

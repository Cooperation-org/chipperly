import { z } from 'zod';
import { SyncColumnsSchema, uuidSchema } from './common.js';

export const LocationSchema = SyncColumnsSchema.extend({
  name: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  position: z.number().int(),
  chip_goal: z.number().int().positive(),
  working_for_reward_id: uuidSchema.nullable(),
});
export type Location = z.infer<typeof LocationSchema>;

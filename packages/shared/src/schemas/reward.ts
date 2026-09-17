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
});
export type Reward = z.infer<typeof RewardSchema>;

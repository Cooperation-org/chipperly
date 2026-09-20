import { z } from 'zod';
import { SyncColumnsSchema, uuidSchema } from './common.js';

export const LocationSchema = SyncColumnsSchema.extend({
  name: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  position: z.number().int(),
  chip_goal: z.number().int().positive(),
  working_for_reward_id: uuidSchema.nullable(),
  /** Optional geofence center/radius for a future auto-switch feature; null means none is set. */
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  radius_m: z.number().int().positive().nullable(),
});
export type Location = z.infer<typeof LocationSchema>;

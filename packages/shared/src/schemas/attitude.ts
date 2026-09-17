import { z } from 'zod';
import { msTimestampSchema, SyncColumnsSchema, uuidSchema } from './common.js';

export const AttitudeValue = z.enum(['good', 'grumpy']);
export type AttitudeValue = z.infer<typeof AttitudeValue>;

/** Append-only. */
export const AttitudeCheckSchema = SyncColumnsSchema.extend({
  schedule_item_id: uuidSchema.nullable(),
  value: AttitudeValue,
  created_at: msTimestampSchema,
  created_by: uuidSchema,
});
export type AttitudeCheck = z.infer<typeof AttitudeCheckSchema>;

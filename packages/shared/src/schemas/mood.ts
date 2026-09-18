import { z } from 'zod';
import { isoDateSchema, msTimestampSchema, SyncColumnsSchema, uuidSchema } from './common.js';

/**
 * Append-only. One row per mood-meter tap (Chipper Chart). The day's level
 * is `level_after` of the newest row for that `date`, or 0 with no rows.
 */
export const MoodEventSchema = SyncColumnsSchema.extend({
  date: isoDateSchema,
  /** Signed change applied by this tap: +-1 for a button, or the jump when the bar is tapped directly. */
  delta: z.number().int().min(-10).max(10),
  level_after: z.number().int().min(-5).max(5),
  created_at: msTimestampSchema,
  created_by: uuidSchema,
});
export type MoodEvent = z.infer<typeof MoodEventSchema>;

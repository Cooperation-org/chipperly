import { z } from 'zod';
import { msTimestampSchema, SyncColumnsSchema, uuidSchema } from './common.js';

export const AttitudeValue = z.enum(['good', 'grumpy']);
export type AttitudeValue = z.infer<typeof AttitudeValue>;

/** 1 very upset .. 5 great: the five faces the child picks from. */
export const FeelingSchema = z.number().int().min(1).max(5);
export type Feeling = z.infer<typeof FeelingSchema>;

/** After a task, any moment of the day ("How do I feel?"), or the end-of-day check-up (child or team). */
export const AttitudeKind = z.enum(['task', 'moment', 'checkup']);
export type AttitudeKind = z.infer<typeof AttitudeKind>;

/** 3 and up reads as the old 'good', so rows from older clients and the new ones share one `value`. */
export function valueForFeeling(feeling: Feeling): AttitudeValue {
  return feeling >= 3 ? 'good' : 'grumpy';
}

/** Append-only. `feeling`, `kind` and `note` are optional so rows written before them (good/grumpy only) still parse. */
export const AttitudeCheckSchema = SyncColumnsSchema.extend({
  schedule_item_id: uuidSchema.nullable(),
  value: AttitudeValue,
  feeling: FeelingSchema.nullable().optional(),
  kind: AttitudeKind.nullable().optional(),
  /** Check-up only: what was hard, or the team member's note on the day. */
  note: z.string().max(2000).nullable().optional(),
  created_at: msTimestampSchema,
  created_by: uuidSchema,
});
export type AttitudeCheck = z.infer<typeof AttitudeCheckSchema>;

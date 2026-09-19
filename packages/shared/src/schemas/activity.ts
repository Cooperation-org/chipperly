import { z } from 'zod';
import { hhmmSchema, isoDateSchema, SyncColumnsSchema, uuidSchema } from './common.js';

export const RecurrenceSchema = z.enum(['daily', 'weekdays', 'weekends', 'weekly']);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

/** 0 (Sunday) - 6 (Saturday), same convention as helpers/date.ts `weekday`, ascending with no repeats. */
const RecurrenceWeekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .nullable()
  .refine(
    (weekdays) => weekdays === null || weekdays.every((day, i) => i === 0 || day > (weekdays[i - 1] as number)),
    'recurrence_weekdays must be sorted ascending with no duplicates',
  );

export const ActivitySchema = SyncColumnsSchema.extend({
  name: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  chip_value: z.number().int().nonnegative(),
  /** Location this activity belongs to; null means "everywhere". */
  location_id: uuidSchema.nullable(),
  recurrence: RecurrenceSchema.nullable(),
  /** Days of the week this recurs on; empty/null when recurrence is not `weekly`. */
  recurrence_weekdays: RecurrenceWeekdaysSchema,
  recurrence_time: hhmmSchema.nullable(),
  position: z.number().int(),
  /**
   * Routine goal ("get to camp on time") and the reward for meeting it,
   * shown in the Chips tab's "by routine" view. Optional (not just
   * nullable) so rows written before these columns existed still parse.
   */
  goal_text: z.string().nullable().optional(),
  goal_reward_id: uuidSchema.nullable().optional(),
});
export type Activity = z.infer<typeof ActivitySchema>;

/**
 * An activity with steps is a routine; there is no separate routines table.
 * Steps can nest (a visual-schedule step broken into sub-steps): a root
 * step's `parent_step_id` is null, and siblings are ordered by `position`
 * within the same parent (not globally).
 */
export const ActivityStepSchema = SyncColumnsSchema.extend({
  activity_id: uuidSchema,
  parent_step_id: uuidSchema.nullable(),
  position: z.number().int(),
  name: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  /** Minutes for an optional "start a timer for this step" affordance; untimed when null. */
  duration_minutes: z.number().int().min(1).max(120).nullable(),
});
export type ActivityStep = z.infer<typeof ActivityStepSchema>;

/** One row per suppressed occurrence of a recurring activity. Append-only. */
export const RecurrenceSkipSchema = SyncColumnsSchema.extend({
  activity_id: uuidSchema,
  date: isoDateSchema,
});
export type RecurrenceSkip = z.infer<typeof RecurrenceSkipSchema>;

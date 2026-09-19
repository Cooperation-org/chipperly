import { z } from 'zod';
import { hhmmSchema, isoDateSchema, msTimestampSchema, SyncColumnsSchema, uuidSchema } from './common.js';

export const PartOfDay = z.enum(['morning', 'afternoon', 'evening']);
export type PartOfDay = z.infer<typeof PartOfDay>;

export const ScheduleItemSource = z.enum(['manual', 'recurring']);
export type ScheduleItemSource = z.infer<typeof ScheduleItemSource>;

export const ScheduleItemSchema = SyncColumnsSchema.extend({
  date: isoDateSchema,
  position: z.number().int(),
  activity_id: uuidSchema,
  start_time: hhmmSchema.nullable(),
  part_of_day: PartOfDay.nullable(),
  source: ScheduleItemSource,
  completed_at: msTimestampSchema.nullable(),
  completed_by: uuidSchema.nullable(),
  /** A social story to read for this item (the dentist example). Optional so older rows still parse. */
  story_id: uuidSchema.nullable().optional(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

/**
 * A caregiver's note for one day, shown to the child at the top of Today
 * (today's) and at the bottom (tomorrow's). One live row per date; if two
 * devices created one offline the client shows the newest.
 */
export const DayPlanSchema = SyncColumnsSchema.extend({
  date: isoDateSchema,
  note: z.string(),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

/**
 * One row per completed step. Append-only: un-completing a step soft-deletes
 * its row (`deleted_at`) rather than clearing `completed_at`.
 */
export const StepCompletionSchema = SyncColumnsSchema.extend({
  schedule_item_id: uuidSchema,
  activity_step_id: uuidSchema,
  completed_at: msTimestampSchema,
  completed_by: uuidSchema,
});
export type StepCompletion = z.infer<typeof StepCompletionSchema>;

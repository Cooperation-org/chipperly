import { bigint, date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { PartOfDay, ScheduleItemSource } from '@chipperly/shared/schemas/schedule';
import { syncColumns } from './_sync.js';

export const schedule_items = pgTable(
  'schedule_items',
  {
    ...syncColumns(),
    date: date('date', { mode: 'string' }).notNull(),
    position: integer('position').notNull(),
    activity_id: uuid('activity_id').notNull(),
    /** HH:MM, nullable. */
    start_time: text('start_time'),
    part_of_day: text('part_of_day').$type<PartOfDay>(),
    source: text('source').$type<ScheduleItemSource>().notNull(),
    completed_at: bigint('completed_at', { mode: 'number' }),
    completed_by: uuid('completed_by'),
    /** A social story to read for this item (the dentist example); owner's doc, My Day 8. */
    story_id: uuid('story_id'),
  },
  (t) => [index('schedule_items_profile_version_idx').on(t.profile_id, t.version)],
);

/**
 * One row per day the caregiver wrote a note for: what the child should
 * know about that day. The child's Today shows today's at the top and
 * tomorrow's at the bottom (owner's doc, My Day: "information at the top
 * ... at the bottom prepare him for the next day"). At most one live row
 * per date; the client keeps the newest if two devices created one offline.
 */
export const day_plans = pgTable(
  'day_plans',
  {
    ...syncColumns(),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [
    index('day_plans_profile_version_idx').on(t.profile_id, t.version),
    index('day_plans_profile_date_idx').on(t.profile_id, t.date),
  ],
);

/**
 * One row per completed step. Append-only: un-completing a step soft-deletes
 * its row rather than clearing `completed_at`.
 */
export const step_completions = pgTable(
  'step_completions',
  {
    ...syncColumns(),
    schedule_item_id: uuid('schedule_item_id').notNull(),
    activity_step_id: uuid('activity_step_id').notNull(),
    completed_at: bigint('completed_at', { mode: 'number' }).notNull(),
    completed_by: uuid('completed_by').notNull(),
  },
  (t) => [index('step_completions_profile_version_idx').on(t.profile_id, t.version)],
);

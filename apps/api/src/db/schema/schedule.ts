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
  },
  (t) => [index('schedule_items_profile_version_idx').on(t.profile_id, t.version)],
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

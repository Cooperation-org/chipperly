import { date, index, integer, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import type { Recurrence } from '@chipperly/shared/schemas/activity';
import { syncColumns } from './_sync.js';

export const activities = pgTable(
  'activities',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    photo_id: uuid('photo_id'),
    chip_value: integer('chip_value').notNull().default(0),
    /** Null means "everywhere". */
    location_id: uuid('location_id'),
    recurrence: text('recurrence').$type<Recurrence>(),
    /** 0 (Sunday) - 6 (Saturday); set only for `weekly`. */
    recurrence_weekday: smallint('recurrence_weekday'),
    /** HH:MM, e.g. "07:30". */
    recurrence_time: text('recurrence_time'),
    position: integer('position').notNull(),
  },
  (t) => [index('activities_profile_version_idx').on(t.profile_id, t.version)],
);

/** An activity with steps is a routine; there is no separate routines table. */
export const activity_steps = pgTable(
  'activity_steps',
  {
    ...syncColumns(),
    activity_id: uuid('activity_id').notNull(),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    photo_id: uuid('photo_id'),
  },
  (t) => [index('activity_steps_profile_version_idx').on(t.profile_id, t.version)],
);

/** One row per suppressed occurrence of a recurring activity. Append-only. */
export const recurrence_skips = pgTable(
  'recurrence_skips',
  {
    ...syncColumns(),
    activity_id: uuid('activity_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
  },
  (t) => [index('recurrence_skips_profile_version_idx').on(t.profile_id, t.version)],
);

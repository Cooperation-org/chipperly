import { date, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { EventRecurrence } from '@chipperly/shared/schemas/event';
import { syncColumns } from './_sync.js';

/** Dated or recurring things about a day (doctor, short day, crazy hair day); see packages/shared/src/schemas/event.ts. */
export const day_events = pgTable(
  'day_events',
  {
    ...syncColumns(),
    title: text('title').notNull(),
    emoji: text('emoji'),
    photo_id: uuid('photo_id'),
    note: text('note'),
    what_to_wear: text('what_to_wear'),
    story_id: uuid('story_id'),
    date: date('date', { mode: 'string' }).notNull(),
    start_time: text('start_time'),
    recurrence: text('recurrence').$type<EventRecurrence>(),
    recurrence_weekdays: integer('recurrence_weekdays').array(),
    remind_days_before: integer('remind_days_before').notNull().default(0),
    remind_hour: integer('remind_hour').notNull().default(8),
    /** YYYY-MM-DD "today" values on which the Today reminder was dismissed. */
    reminder_dismissed: text('reminder_dismissed').array().notNull().default([]),
  },
  (t) => [
    index('day_events_profile_version_idx').on(t.profile_id, t.version),
    index('day_events_profile_date_idx').on(t.profile_id, t.date),
  ],
);

/** The sent-marker for the morning event push: the caregiver's local "today" of the last push for this event. Not synced. */
export const event_reminder_sent = pgTable(
  'event_reminder_sent',
  {
    event_id: uuid('event_id').notNull(),
    user_id: uuid('user_id').notNull(),
    sent_for: date('sent_for', { mode: 'string' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.event_id, t.user_id] })],
);

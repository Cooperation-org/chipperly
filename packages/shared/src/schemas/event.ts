import { z } from 'zod';
import { hhmmSchema, isoDateSchema, SyncColumnsSchema, uuidSchema } from './common.js';
import { ActivitySchema, RecurrenceSchema } from './activity.js';
import { addDays, weekday } from '../helpers/date.js';

/**
 * The existing activity recurrence kinds plus `yearly` (the yearly doctor
 * appointment). `yearly` is event-only: it is not added to `RecurrenceSchema`
 * because activities have no use for it and their forms switch over the enum.
 */
export const EventRecurrenceSchema = z.union([RecurrenceSchema, z.literal('yearly')]);
export type EventRecurrence = z.infer<typeof EventRecurrenceSchema>;

/** Reminders never look further ahead than this many days. */
export const MAX_EVENT_REMIND_DAYS = 30;
export const DEFAULT_EVENT_REMIND_HOUR = 8;

/**
 * One thing about a day: a short day at school, a doctor appointment, crazy
 * hair day, visiting family, a different outfit, a big event later in the
 * week. Read by the Tomorrow band, Today, and (morning push) the API.
 *
 * Dated: `recurrence` is null and `date` is the day. Recurring: `date` is the
 * first day it applies (the anchor) and `recurrence` says how it repeats;
 * `yearly` repeats on the anchor's month and day.
 *
 * Reminders reuse the review-reminder shape (a count plus a local hour, see
 * schemas/billing.ts): `remind_days_before` = N notifies on each of the N days
 * before the event (0 = no reminder), at `remind_hour` local time.
 * `reminder_dismissed` holds the dates ("today" values) on which the caregiver
 * removed the reminder from the Today screen.
 */
export const DayEventSchema = SyncColumnsSchema.extend({
  title: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  note: z.string().nullable(),
  what_to_wear: z.string().nullable(),
  story_id: uuidSchema.nullable(),
  date: isoDateSchema,
  start_time: hhmmSchema.nullable(),
  recurrence: EventRecurrenceSchema.nullable(),
  /** 0 (Sunday) - 6 (Saturday); only read when `recurrence` is `weekly`. Same rules as activities. */
  recurrence_weekdays: ActivitySchema.shape.recurrence_weekdays,
  remind_days_before: z.number().int().min(0).max(MAX_EVENT_REMIND_DAYS),
  remind_hour: z.number().int().min(0).max(23),
  reminder_dismissed: z.array(isoDateSchema),
});
export type DayEvent = z.infer<typeof DayEventSchema>;

type EventTiming = Pick<DayEvent, 'date' | 'recurrence' | 'recurrence_weekdays' | 'deleted_at'>;

/** Whether the event happens on `isoDate`. Deleted events never do. */
export function eventOccursOn(event: EventTiming, isoDate: string): boolean {
  if (event.deleted_at !== null) return false;
  if (!event.recurrence) return isoDate === event.date;
  if (isoDate < event.date) return false;

  const wd = weekday(isoDate);
  switch (event.recurrence) {
    case 'daily':
      return true;
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekends':
      return wd === 0 || wd === 6;
    case 'weekly': {
      // An event saved without weekdays repeats on the weekday of its first day.
      const days = event.recurrence_weekdays && event.recurrence_weekdays.length > 0 ? event.recurrence_weekdays : [weekday(event.date)];
      return days.includes(wd);
    }
    case 'yearly':
      // ponytail: a Feb 29 event only shows in leap years; add a Feb 28 fallback if anyone asks.
      return isoDate.slice(5) === event.date.slice(5);
  }
}

/**
 * The reminder to show on `isoDate`, as the number of days until the event
 * (1 = tomorrow), or null when there is none. Due when the event happens on
 * one of the `remind_days_before` days after `isoDate` and the caregiver has
 * not dismissed today's reminder. The nearest occurrence wins. The day itself
 * is not a reminder: the event is simply shown as today's.
 */
export function reminderDaysUntil(
  event: EventTiming & Pick<DayEvent, 'remind_days_before' | 'reminder_dismissed'>,
  isoDate: string,
): number | null {
  if (event.remind_days_before <= 0 || event.deleted_at !== null) return null;
  if (event.reminder_dismissed.includes(isoDate)) return null;
  for (let k = 1; k <= event.remind_days_before; k += 1) {
    if (eventOccursOn(event, addDays(isoDate, k))) return k;
  }
  return null;
}

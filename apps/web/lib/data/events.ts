'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays } from '@chipperly/shared/helpers/date';
import {
  DEFAULT_EVENT_REMIND_HOUR,
  eventOccursOn,
  reminderDaysUntil,
  type DayEvent,
  type EventRecurrence,
} from '@chipperly/shared/schemas/event';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';

export interface EventReminder {
  event: DayEvent;
  /** 1 = tomorrow. */
  days_until: number;
}

/** Live (non-deleted) events on `isoDate`, timed ones first by time, then by title. */
export function eventsOnDate(events: readonly DayEvent[], isoDate: string): DayEvent[] {
  return events
    .filter((event) => eventOccursOn(event, isoDate))
    .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.title.localeCompare(b.title));
}

/** Reminders showing on `isoDate` (not dismissed), nearest event first. */
export function remindersOnDate(events: readonly DayEvent[], isoDate: string): EventReminder[] {
  const out: EventReminder[] = [];
  for (const event of events) {
    const days_until = reminderDaysUntil(event, isoDate);
    if (days_until !== null) out.push({ event, days_until });
  }
  return out.sort((a, b) => a.days_until - b.days_until || a.event.title.localeCompare(b.event.title));
}

/** How far ahead "Coming up" looks. */
export const COMING_UP_DAYS = 30;

export interface UpcomingEvent {
  event: DayEvent;
  /** The next day it happens after `isoDate`. */
  date: string;
  /** 1 = tomorrow. */
  days_until: number;
}

/**
 * Each event's next occurrence in the days after `isoDate`, soonest first. Events that repeat every
 * day, weekday or weekend are left out: they are the routine, not something coming up.
 */
export function upcomingEvents(events: readonly DayEvent[], isoDate: string, horizon: number = COMING_UP_DAYS): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  for (const event of events) {
    if (event.recurrence === 'daily' || event.recurrence === 'weekdays' || event.recurrence === 'weekends') continue;
    for (let k = 1; k <= horizon; k += 1) {
      const date = addDays(isoDate, k);
      if (eventOccursOn(event, date)) {
        out.push({ event, date, days_until: k });
        break;
      }
    }
  }
  return out.sort(
    (a, b) => a.days_until - b.days_until || (a.event.start_time ?? '99:99').localeCompare(b.event.start_time ?? '99:99') || a.event.title.localeCompare(b.event.title),
  );
}

/** "tomorrow" or "in 3 days". */
export function daysUntilLabel(daysUntil: number): string {
  return daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
}

/** Keeps the dismissed list short: only dates from the last 14 days can still matter. */
export function withDismissed(dismissed: readonly string[], isoDate: string): string[] {
  const oldest = addDays(isoDate, -14);
  return [...new Set([...dismissed, isoDate])].filter((d) => d >= oldest).sort();
}

export function useDayEvents(profileId: string): DayEvent[] {
  const rows = useLiveQuery(() => db.day_events.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => rows.filter((row) => row.deleted_at === null), [rows]);
}

export interface SaveEventInput {
  id?: string;
  profile_id: string;
  title: string;
  emoji: string | null;
  photo_id: string | null;
  note: string | null;
  what_to_wear: string | null;
  story_id: string | null;
  date: string;
  start_time: string | null;
  recurrence: EventRecurrence | null;
  recurrence_weekdays: number[] | null;
  remind_days_before: number;
  remind_hour?: number;
}

const blankToNull = (text: string | null): string | null => (text && text.trim() ? text.trim() : null);

export async function saveEvent(input: SaveEventInput): Promise<string> {
  const existing = input.id ? await db.day_events.get(input.id) : undefined;
  const id = input.id ?? newId();
  await upsert('day_events', {
    id,
    profile_id: input.profile_id,
    version: existing?.version ?? 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    title: input.title.trim(),
    emoji: input.emoji,
    photo_id: input.photo_id,
    note: blankToNull(input.note),
    what_to_wear: blankToNull(input.what_to_wear),
    story_id: input.story_id,
    date: input.date,
    start_time: input.start_time,
    recurrence: input.recurrence,
    recurrence_weekdays: input.recurrence === 'weekly' ? input.recurrence_weekdays : null,
    remind_days_before: input.remind_days_before,
    remind_hour: input.remind_hour ?? existing?.remind_hour ?? DEFAULT_EVENT_REMIND_HOUR,
    // Moving the event or changing its reminder starts the reminders fresh.
    reminder_dismissed: existing && existing.date === input.date && existing.remind_days_before === input.remind_days_before ? existing.reminder_dismissed : [],
  } satisfies DayEvent);
  return id;
}

export async function deleteEvent(id: string): Promise<void> {
  await softDelete('day_events', id);
}

/** Removes this event's reminder from Today for `isoDate` only; tomorrow's reminder still shows. */
export async function dismissReminder(event: DayEvent, isoDate: string): Promise<void> {
  await upsert('day_events', { ...event, reminder_dismissed: withDismissed(event.reminder_dismissed, isoDate) });
}

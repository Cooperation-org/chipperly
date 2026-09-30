'use client';

import { useMemo } from 'react';
import { daysUntilLabel, dismissReminder, eventsOnDate, remindersOnDate, useDayEvents } from '@/lib/data/events';
import { IconButton } from '@/components/ui/IconButton';
import { useSheet } from '@/components/ui/Sheet';
import { EventLine } from './EventLine';
import { EventSheet } from './EventSheet';
import styles from './TodayEvents.module.css';

export interface TodayEventsProps {
  profileId: string;
  /** The day being viewed on Today. */
  isoDate: string;
}

/**
 * Today's events, then the reminders for events coming up (each removable
 * for today with the X). Nothing at all when there are none. Caregiver
 * Today only: a hard-locked child device can't push edits (sync lock gate).
 */
export function TodayEvents({ profileId, isoDate }: TodayEventsProps) {
  const events = useDayEvents(profileId);
  const { open } = useSheet();
  const happening = useMemo(() => eventsOnDate(events, isoDate), [events, isoDate]);
  const reminders = useMemo(() => remindersOnDate(events, isoDate), [events, isoDate]);

  if (happening.length === 0 && reminders.length === 0) return null;

  return (
    <section className={styles.band} aria-label="Events">
      {happening.length > 0 ? (
        <ul className={styles.list}>
          {happening.map((event) => (
            <EventLine
              key={event.id}
              event={event}
              actions={
                <IconButton
                  icon="edit"
                  aria-label={`Edit ${event.title}`}
                  onClick={() => open(<EventSheet profileId={profileId} isoDate={isoDate} event={event} />, { title: 'Edit event' })}
                />
              }
            />
          ))}
        </ul>
      ) : null}
      {reminders.length > 0 ? (
        <ul className={styles.list} aria-label="Reminders">
          {reminders.map(({ event, days_until }) => (
            <EventLine
              key={event.id}
              event={event}
              kicker={`Reminder: ${daysUntilLabel(days_until)}`}
              actions={<IconButton icon="close" aria-label={`Remove reminder for ${event.title}`} onClick={() => void dismissReminder(event, isoDate)} />}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

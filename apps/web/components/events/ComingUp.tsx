'use client';

import { useMemo, useState } from 'react';
import { upcomingEvents, useDayEvents, type UpcomingEvent } from '@/lib/data/events';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useSheet } from '@/components/ui/Sheet';
import { EventLine } from './EventLine';
import { EventSheet } from './EventSheet';
import styles from './ComingUp.module.css';

const SHOWN_AT_FIRST = 4;

/** "Thu, Oct 9" for an ISO date, in the viewer's own words. */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function kicker({ date, days_until }: UpcomingEvent): string {
  return days_until === 1 ? 'Tomorrow' : `${dayLabel(date)}, in ${days_until} days`;
}

export interface ComingUpProps {
  profileId: string;
  /** The day being viewed on Today; "coming up" means after it. */
  isoDate: string;
}

/**
 * The next time each one-off or weekly event happens, over the next 30 days: a doctor visit, a horse
 * lesson, speech therapy. Always shown on caregiver Today, since its button is the way to add an event.
 */
export function ComingUp({ profileId, isoDate }: ComingUpProps) {
  const events = useDayEvents(profileId);
  const { open } = useSheet();
  const [all, setAll] = useState(false);
  const upcoming = useMemo(() => upcomingEvents(events, isoDate), [events, isoDate]);

  const shown = all ? upcoming : upcoming.slice(0, SHOWN_AT_FIRST);

  return (
    <section className={styles.band} aria-labelledby="coming-up-heading">
      <h2 id="coming-up-heading" className={styles.heading}>
        Coming up
      </h2>
      {upcoming.length === 0 ? <p className={styles.empty}>Appointments, lessons and visits show up here.</p> : null}
      <ul className={styles.list}>
        {shown.map((item) => (
          <EventLine
            key={item.event.id}
            event={item.event}
            kicker={kicker(item)}
            actions={
              <IconButton
                icon="edit"
                aria-label={`Edit ${item.event.title}`}
                onClick={() => open(<EventSheet profileId={profileId} isoDate={isoDate} event={item.event} />, { title: 'Edit event' })}
              />
            }
          />
        ))}
      </ul>
      <Button
        variant="secondary"
        icon="plus"
        onClick={() => open(<EventSheet profileId={profileId} isoDate={isoDate} />, { title: 'Add an event' })}
      >
        Add an event
      </Button>
      {upcoming.length > SHOWN_AT_FIRST ? (
        <Button variant="ghost" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show ${upcoming.length - SHOWN_AT_FIRST} more`}
        </Button>
      ) : null}
    </section>
  );
}

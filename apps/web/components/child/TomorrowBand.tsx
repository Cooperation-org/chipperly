'use client';

import { useMemo } from 'react';
import { addDays } from '@chipperly/shared/helpers/date';
import { useDayNote } from '@/lib/data/dayPlans';
import { eventsOnDate, useDayEvents } from '@/lib/data/events';
import { useLock } from '@/lib/device/settings';
import { EventLine } from '@/components/events/EventLine';
import { EventSheet } from '@/components/events/EventSheet';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { useSheet } from '@/components/ui/Sheet';
import { weekdayName } from '@/components/schedule/todayModel';
import styles from './TomorrowBand.module.css';

export interface TomorrowBandProps {
  profileId: string;
  /** Today's date; tomorrow is derived from it. */
  isoDate: string;
}

/** How many days after tomorrow to look for "coming up this week". */
const LOOKAHEAD_DAYS = 5;

/**
 * S32 bottom band: prepares the child for tomorrow with the caregiver's note
 * and tomorrow's events (short day, doctor, crazy hair day, what to wear),
 * then a line each for bigger things later in the week. Not the routine.
 * A caregiver can add and edit events here unless the device is hard-locked
 * (the server refuses event edits from a locked session).
 */
export function TomorrowBand({ profileId, isoDate }: TomorrowBandProps) {
  const tomorrowIso = addDays(isoDate, 1);
  const note = useDayNote(profileId, tomorrowIso);
  const events = useDayEvents(profileId);
  const { locked_profile_id } = useLock();
  const { open } = useSheet();
  const canEdit = !locked_profile_id;

  const tomorrow = useMemo(() => eventsOnDate(events, tomorrowIso), [events, tomorrowIso]);
  const later = useMemo(
    () =>
      Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => addDays(tomorrowIso, i + 1)).flatMap((iso) =>
        eventsOnDate(events, iso).map((event) => ({ iso, event })),
      ),
    [events, tomorrowIso],
  );

  function edit(event?: (typeof tomorrow)[number]): void {
    open(<EventSheet profileId={profileId} isoDate={tomorrowIso} event={event} />, { title: event ? 'Edit event' : 'Add to tomorrow' });
  }

  return (
    <section className={styles.band} aria-label="Tomorrow">
      <p className={styles.heading}>Tomorrow, {weekdayName(tomorrowIso)}</p>
      {note?.note ? <p className={styles.note}>{note.note}</p> : null}

      {tomorrow.length === 0 ? (
        <p className={styles.empty}>Nothing special tomorrow</p>
      ) : (
        <ul className={styles.list}>
          {tomorrow.map((event) => (
            <EventLine
              key={event.id}
              event={event}
              actions={canEdit ? <IconButton icon="edit" aria-label={`Edit ${event.title}`} onClick={() => edit(event)} /> : null}
            />
          ))}
        </ul>
      )}

      {later.length > 0 ? (
        <>
          <p className={styles.subheading}>Coming up</p>
          <ul className={styles.list}>
            {later.map(({ iso, event }) => (
              <EventLine key={`${event.id}:${iso}`} event={event} kicker={weekdayName(iso)} />
            ))}
          </ul>
        </>
      ) : null}

      {canEdit ? (
        <Button variant="secondary" icon="plus" onClick={() => edit()}>
          Add to tomorrow
        </Button>
      ) : null}
    </section>
  );
}

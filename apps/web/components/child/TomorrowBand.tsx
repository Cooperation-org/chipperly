'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays } from '@chipperly/shared/helpers/date';
import { db } from '@/lib/db/db';
import { previewDay } from '@/lib/data/schedule';
import { useDayNote } from '@/lib/data/dayPlans';
import { Picture } from '@/components/media/Picture';
import { weekdayName } from '@/components/schedule/todayModel';
import styles from './TomorrowBand.module.css';

export interface TomorrowBandProps {
  profileId: string;
  /** Today's date; tomorrow is derived from it. */
  isoDate: string;
}

const PREVIEW_COUNT = 3;

/**
 * S32 bottom band: prepares the child for tomorrow -- tomorrow's caregiver
 * note (if any) and the first three things planned, without materializing
 * any rows a day early (`previewDay`, lib/data/schedule.ts).
 */
export function TomorrowBand({ profileId, isoDate }: TomorrowBandProps) {
  const tomorrowIso = addDays(isoDate, 1);
  const note = useDayNote(profileId, tomorrowIso);

  const activities = useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const skips = useLiveQuery(() => db.recurrence_skips.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const manualItems = useLiveQuery(
    () => db.schedule_items.where('[profile_id+date]').equals([profileId, tomorrowIso]).toArray(),
    [profileId, tomorrowIso],
    [],
  );

  const preview = useMemo(
    () => previewDay(activities, skips, manualItems, tomorrowIso),
    [activities, skips, manualItems, tomorrowIso],
  );
  const shown = preview.slice(0, PREVIEW_COUNT);
  const more = preview.length - shown.length;

  return (
    <section className={styles.band} aria-label="Tomorrow">
      <p className={styles.heading}>Tomorrow, {weekdayName(tomorrowIso)}</p>
      {note?.note ? <p className={styles.note}>{note.note}</p> : null}

      {shown.length === 0 ? (
        <p className={styles.empty}>Nothing planned yet</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((entry) => (
            <li key={entry.id} className={styles.item}>
              <Picture emoji={entry.activity.emoji} photo_id={entry.activity.photo_id} name={entry.activity.name} size="list" />
              <span>{entry.activity.name}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? <p className={styles.more}>and {more} more</p> : null}
    </section>
  );
}

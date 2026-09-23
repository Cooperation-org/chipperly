'use client';

import { formatDayMonth, useDayNote } from '@/lib/data/dayPlans';
import { weekdayName } from '@/components/schedule/todayModel';
import styles from './DayBand.module.css';

export interface DayBandProps {
  profileId: string;
  isoDate: string;
  itemCount: number;
}

/**
 * S32 top band: prepares the child for today -- the date in words, the
 * caregiver's note for today (if any), and a one-line summary of what's
 * ahead. Calm, no color-only meaning (ux-plan.md section 8/13). The
 * working-for reward lives in the header's chip strip, not repeated here.
 */
export function DayBand({ profileId, isoDate, itemCount }: DayBandProps) {
  const note = useDayNote(profileId, isoDate);

  return (
    <section className={styles.band} aria-label="Today">
      <p className={styles.date}>
        {weekdayName(isoDate)} {formatDayMonth(isoDate)}
      </p>
      {note?.note ? <p className={styles.note}>{note.note}</p> : null}
      <p className={styles.summary}>
        {itemCount} thing{itemCount === 1 ? '' : 's'} today
      </p>
    </section>
  );
}

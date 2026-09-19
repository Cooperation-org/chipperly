'use client';

import { formatDayMonth, useDayNote } from '@/lib/data/dayPlans';
import type { WorkingFor } from '@/lib/data/chips';
import { Picture } from '@/components/media/Picture';
import { weekdayName } from '@/components/schedule/todayModel';
import styles from './DayBand.module.css';

export interface DayBandProps {
  profileId: string;
  isoDate: string;
  itemCount: number;
  workingFor: WorkingFor;
}

/**
 * S32 top band: prepares the child for today -- the date in words, the
 * caregiver's note for today (if any), and a one-line summary of what's
 * ahead. Calm, no color-only meaning (ux-plan.md section 8/13).
 */
export function DayBand({ profileId, isoDate, itemCount, workingFor }: DayBandProps) {
  const note = useDayNote(profileId, isoDate);

  return (
    <section className={styles.band} aria-label="Today">
      <p className={styles.date}>
        {weekdayName(isoDate)} {formatDayMonth(isoDate)}
      </p>
      {note?.note ? <p className={styles.note}>{note.note}</p> : null}
      <p className={styles.summary}>
        {itemCount} thing{itemCount === 1 ? '' : 's'} today
        {workingFor.reward ? (
          <span className={styles.working}>
            {' '}
            &middot; Working for
            <Picture
              emoji={workingFor.reward.emoji ?? undefined}
              photo_id={workingFor.reward.photo_id}
              name={workingFor.reward.name}
              size="list"
            />
            {workingFor.reward.name}
          </span>
        ) : null}
      </p>
    </section>
  );
}

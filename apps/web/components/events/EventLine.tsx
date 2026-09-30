'use client';

import type { ReactNode } from 'react';
import type { DayEvent } from '@chipperly/shared/schemas/event';
import { formatTime } from '@/components/schedule/todayModel';
import { ReadStoryButton } from '@/components/child/ReadStoryButton';
import { EventPicture } from './EventPicture';
import styles from './EventLine.module.css';

export interface EventLineProps {
  event: DayEvent;
  /** Small text above the title, e.g. "In 3 days". */
  kicker?: string;
  /** Buttons at the end of the row (edit, dismiss). */
  actions?: ReactNode;
}

/** One event as a row: picture, title, time, what to wear, note, and its story. Used by Today and Tomorrow. */
export function EventLine({ event, kicker, actions }: EventLineProps) {
  return (
    <li className={styles.line}>
      <EventPicture emoji={event.emoji} photoId={event.photo_id} title={event.title} size="list" />
      <div className={styles.text}>
        {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
        <p className={styles.title}>
          {event.title}
          {event.start_time ? <span className={styles.time}> at {formatTime(event.start_time)}</span> : null}
        </p>
        {event.what_to_wear ? <p className={styles.detail}>Wear: {event.what_to_wear}</p> : null}
        {event.note ? <p className={styles.detail}>{event.note}</p> : null}
        {event.story_id ? <ReadStoryButton storyId={event.story_id} /> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </li>
  );
}

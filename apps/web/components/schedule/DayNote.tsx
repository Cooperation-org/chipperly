'use client';

import { todayIso } from '@chipperly/shared/helpers/date';
import { dayNotePhotoAlt, hasDayNoteContent, useDayNote } from '@/lib/data/dayPlans';
import { useMediaUrl } from '@/lib/data/media';
import { IconButton } from '@/components/ui/IconButton';
import { useSheet } from '@/components/ui/Sheet';
import { weekdayName } from './todayModel';
import { DayNoteSheet } from './DayNoteSheet';
import styles from './DayNote.module.css';

export interface DayNoteProps {
  profileId: string;
  isoDate: string;
  childName: string;
}

function useDayNoteEditor({ profileId, isoDate, childName }: DayNoteProps) {
  const note = useDayNote(profileId, isoDate);
  const { open } = useSheet();
  // DateNav can be on any date, so the note has to say which day it is for.
  const dayName = isoDate === todayIso() ? 'today' : weekdayName(isoDate);
  function edit(): void {
    open(<DayNoteSheet profileId={profileId} isoDate={isoDate} childName={childName} dayName={dayName} initialNote={note?.note ?? ''} initialPhotoId={note?.photo_id ?? null} />, {
      title: `Note for ${childName}`,
    });
  }
  const text = note?.note ?? '';
  const photoId = note?.photo_id ?? null;
  return { text, photoId, hasContent: hasDayNoteContent(text, photoId), dayName, edit };
}

/** The note's picture, capped in height so it can never push the day's tasks off screen. */
export function DayNotePhoto({ photoId, text }: { photoId: string | null; text: string }) {
  const url = useMediaUrl(photoId);
  if (!photoId || !url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- local blob/object URL, next/image can't optimize it
  return <img className={styles.photo} src={url} alt={dayNotePhotoAlt(text)} />;
}

/** S6: the caregiver's note for the day being viewed, as a band under the day header. Nothing when there's no note. */
export function DayNote(props: DayNoteProps) {
  const { text, photoId, hasContent, dayName, edit } = useDayNoteEditor(props);
  if (!hasContent) return null;
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={styles.label}>
          Note for {props.childName}, {dayName}
        </p>
        {text ? <p className={styles.note}>{text}</p> : null}
        <DayNotePhoto photoId={photoId} text={text} />
      </div>
      <IconButton icon="edit" aria-label={`Edit note for ${props.childName}, ${dayName}`} onClick={edit} />
    </div>
  );
}

/** The "add a note" control when there's none yet: an icon in the chip-strip row, not a full-width row of its own. */
export function DayNoteAddButton(props: DayNoteProps) {
  const { hasContent, dayName, edit } = useDayNoteEditor(props);
  if (hasContent) return null;
  return <IconButton icon="edit" aria-label={`Add a note for ${dayName}`} onClick={edit} />;
}

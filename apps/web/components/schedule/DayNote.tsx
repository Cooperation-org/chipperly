'use client';

import { todayIso } from '@chipperly/shared/helpers/date';
import { useDayNote } from '@/lib/data/dayPlans';
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
    open(<DayNoteSheet profileId={profileId} isoDate={isoDate} childName={childName} dayName={dayName} initialNote={note?.note ?? ''} />, {
      title: `Note for ${childName}`,
    });
  }
  return { text: note?.note ?? '', dayName, edit };
}

/** S6: the caregiver's note for the day being viewed, as a band under the day header. Nothing when there's no note. */
export function DayNote(props: DayNoteProps) {
  const { text, dayName, edit } = useDayNoteEditor(props);
  if (!text) return null;
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={styles.label}>
          Note for {props.childName}, {dayName}
        </p>
        <p className={styles.note}>{text}</p>
      </div>
      <IconButton icon="edit" aria-label={`Edit note for ${props.childName}, ${dayName}`} onClick={edit} />
    </div>
  );
}

/** The "add a note" control when there's none yet: an icon in the chip-strip row, not a full-width row of its own. */
export function DayNoteAddButton(props: DayNoteProps) {
  const { text, dayName, edit } = useDayNoteEditor(props);
  if (text) return null;
  return <IconButton icon="edit" aria-label={`Add a note for ${dayName}`} onClick={edit} />;
}

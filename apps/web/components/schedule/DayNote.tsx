'use client';

import { todayIso } from '@chipperly/shared/helpers/date';
import { useDayNote } from '@/lib/data/dayPlans';
import { Button } from '@/components/ui/Button';
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

/** S6: "Note for {child}" under the day header -- the caregiver's note for the day being viewed, or an Add button. */
export function DayNote({ profileId, isoDate, childName }: DayNoteProps) {
  const note = useDayNote(profileId, isoDate);
  const { open } = useSheet();
  // DateNav can be on any date, so the note has to say which day it is for.
  const dayName = isoDate === todayIso() ? 'today' : weekdayName(isoDate);

  function edit(): void {
    open(<DayNoteSheet profileId={profileId} isoDate={isoDate} childName={childName} dayName={dayName} initialNote={note?.note ?? ''} />, {
      title: `Note for ${childName}`,
    });
  }

  if (!note || !note.note) {
    return (
      <Button variant="secondary" onClick={edit}>
        Add a note for {dayName}
      </Button>
    );
  }

  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={styles.label}>
          Note for {childName}, {dayName}
        </p>
        <p className={styles.note}>{note.note}</p>
      </div>
      <IconButton icon="edit" aria-label={`Edit note for ${childName}, ${dayName}`} onClick={edit} />
    </div>
  );
}

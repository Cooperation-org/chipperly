'use client';

import { useDayNote } from '@/lib/data/dayPlans';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useSheet } from '@/components/ui/Sheet';
import { DayNoteSheet } from './DayNoteSheet';
import styles from './DayNote.module.css';

export interface DayNoteProps {
  profileId: string;
  isoDate: string;
  childName: string;
}

/** S6: "Note for {child}" under the day header -- shows today's caregiver note, or an Add button. */
export function DayNote({ profileId, isoDate, childName }: DayNoteProps) {
  const note = useDayNote(profileId, isoDate);
  const { open } = useSheet();

  function edit(): void {
    open(<DayNoteSheet profileId={profileId} isoDate={isoDate} childName={childName} initialNote={note?.note ?? ''} />, {
      title: `Note for ${childName}`,
    });
  }

  if (!note || !note.note) {
    return (
      <Button variant="secondary" onClick={edit}>
        Add a note for today
      </Button>
    );
  }

  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={styles.label}>Note for {childName}</p>
        <p className={styles.note}>{note.note}</p>
      </div>
      <IconButton icon="edit" aria-label={`Edit note for ${childName}`} onClick={edit} />
    </div>
  );
}

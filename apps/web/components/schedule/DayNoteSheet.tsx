'use client';

import { useId, useState } from 'react';
import { setDayNote } from '@/lib/data/dayPlans';
import { Field } from '@/components/ui/Field';
import { BigButton } from '@/components/ui/BigButton';
import { useSheet } from '@/components/ui/Sheet';
import styles from './DayNoteSheet.module.css';

export interface DayNoteSheetProps {
  profileId: string;
  isoDate: string;
  childName: string;
  /** "today" or a weekday name: Today can be on any date, so the sheet has to say which. */
  dayName: string;
  initialNote: string;
}

/** The small sheet DayNote opens to write or edit one day's caregiver note. */
export function DayNoteSheet({ profileId, isoDate, childName, dayName, initialNote }: DayNoteSheetProps) {
  const { close } = useSheet();
  const [note, setNote] = useState(initialNote);
  const id = useId();

  async function onSave(): Promise<void> {
    await setDayNote(profileId, isoDate, note);
    close();
  }

  return (
    <div className={styles.sheet}>
      <Field label={`Note for ${childName}, ${dayName}`} htmlFor={id}>
        <textarea
          id={id}
          className={styles.textarea}
          rows={4}
          maxLength={280}
          placeholder="Grandma is visiting after school."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <BigButton variant="primary" fullWidth onClick={() => void onSave()}>
        Save
      </BigButton>
    </div>
  );
}

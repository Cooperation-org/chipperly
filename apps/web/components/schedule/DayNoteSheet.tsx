'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';
import { setDayNote } from '@/lib/data/dayPlans';
import { pickAndStoreImage } from '@/lib/data/media';
import { toast } from '@/lib/toast';
import { Field } from '@/components/ui/Field';
import { BigButton } from '@/components/ui/BigButton';
import { useSheet } from '@/components/ui/Sheet';
import { DayNotePhoto } from './DayNote';
import styles from './DayNoteSheet.module.css';

export interface DayNoteSheetProps {
  profileId: string;
  isoDate: string;
  childName: string;
  /** "today" or a weekday name: Today can be on any date, so the sheet has to say which. */
  dayName: string;
  initialNote: string;
  initialPhotoId: string | null;
}

/** The small sheet DayNote opens to write or edit one day's caregiver note. */
export function DayNoteSheet({ profileId, isoDate, childName, dayName, initialNote, initialPhotoId }: DayNoteSheetProps) {
  const { close } = useSheet();
  const [note, setNote] = useState(initialNote);
  const [photoId, setPhotoId] = useState(initialPhotoId);
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhotoId(await pickAndStoreImage(file));
    } catch {
      toast("Couldn't add that photo. Try again.");
    }
  }

  async function onSave(): Promise<void> {
    await setDayNote(profileId, isoDate, note, photoId);
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
      <DayNotePhoto photoId={photoId} text={note} />
      <div className={styles.photoRow}>
        <BigButton variant="secondary" onClick={() => fileRef.current?.click()}>
          {photoId ? 'Change photo' : 'Add a photo'}
        </BigButton>
        {photoId ? (
          <BigButton variant="secondary" onClick={() => setPhotoId(null)}>
            Remove photo
          </BigButton>
        ) : null}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
      <BigButton variant="primary" fullWidth onClick={() => void onSave()}>
        Save
      </BigButton>
    </div>
  );
}

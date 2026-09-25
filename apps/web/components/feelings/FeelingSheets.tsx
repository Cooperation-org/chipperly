'use client';

import { useId, useState } from 'react';
import type { Feeling } from '@chipperly/shared/schemas/attitude';
import { formatDayLabel } from '@chipperly/shared/helpers/date';
import { faceFor, recordFeeling, useFeelingsByDay } from '@/lib/data/feelings';
import type { DayItem } from '@/lib/data/schedule';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { Field } from '@/components/ui/Field';
import { useSheet } from '@/components/ui/Sheet';
import { FeelingFaces } from './FeelingFaces';
import styles from './FeelingSheets.module.css';

/** Child: "How do I feel?" at any moment of the day. One tap records it and closes. */
export function MomentSheet({ profileId }: { profileId: string }) {
  const { close } = useSheet();
  return (
    <div className={styles.sheet}>
      <p className={styles.question}>How do you feel right now?</p>
      <FeelingFaces
        onPick={(feeling) => {
          void recordFeeling(profileId, { feeling, kind: 'moment' });
          close();
        }}
      />
    </div>
  );
}

/**
 * Child's end-of-day check-up: how the day felt, then (optional) which
 * things were hard, as picture tiles. Not a task: it earns nothing and
 * never shows as undone.
 */
export function ChildCheckupSheet({ profileId, dayItems }: { profileId: string; dayItems: readonly DayItem[] }) {
  const { close } = useSheet();
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [hard, setHard] = useState<ReadonlySet<string>>(new Set());

  function finish(): void {
    if (!feeling) return;
    const hardNames = dayItems.filter((d) => hard.has(d.item.id)).map((d) => d.activity.name);
    void recordFeeling(profileId, { feeling, kind: 'checkup', note: hardNames.length > 0 ? `Hard: ${hardNames.join(', ')}` : null });
    close();
  }

  if (!feeling) {
    return (
      <div className={styles.sheet}>
        <p className={styles.question}>How was your day?</p>
        <FeelingFaces onPick={setFeeling} />
      </div>
    );
  }

  return (
    <div className={styles.sheet}>
      <p className={styles.question}>Was anything hard?</p>
      <div className={styles.tiles}>
        {dayItems.map((d) => {
          const picked = hard.has(d.item.id);
          return (
            <button
              key={d.item.id}
              type="button"
              className={styles.tile}
              aria-pressed={picked}
              onClick={() =>
                setHard((prev) => {
                  const next = new Set(prev);
                  if (next.has(d.item.id)) next.delete(d.item.id);
                  else next.add(d.item.id);
                  return next;
                })
              }
            >
              <Picture emoji={d.activity.emoji} photo_id={d.activity.photo_id} name={d.activity.name} size="list" />
              <span className={styles.tileName}>{d.activity.name}</span>
            </button>
          );
        })}
      </div>
      <BigButton variant="primary" fullWidth onClick={finish}>
        {hard.size > 0 ? 'Done' : 'Nothing was hard'}
      </BigButton>
    </div>
  );
}

/** Team member's check-up on the day: the child's faces so far, how the day went overall, and a note. */
export function TeamCheckupSheet({ profileId, isoDate, childName }: { profileId: string; isoDate: string; childName: string }) {
  const { close } = useSheet();
  const noteId = useId();
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [note, setNote] = useState('');
  const today = useFeelingsByDay(profileId).find((d) => d.date === isoDate);
  const faces = today?.entries.filter((e) => e.type === 'feeling') ?? [];

  async function save(): Promise<void> {
    if (!feeling) return;
    await recordFeeling(profileId, { feeling, kind: 'review', note });
    close();
  }

  return (
    <div className={styles.sheet}>
      <p className={styles.caption}>
        {faces.length > 0 ? `${childName}'s feelings, ${formatDayLabel(isoDate)}` : `${childName} hasn't shared a feeling yet today.`}
      </p>
      {faces.length > 0 ? (
        <p className={styles.faceRow} aria-label={faces.map((e) => (e.type === 'feeling' ? faceFor(e.feeling).label : '')).join(', ')}>
          {faces.map((e) => (e.type === 'feeling' ? <span key={e.check.id} aria-hidden="true">{faceFor(e.feeling).emoji}</span> : null))}
        </p>
      ) : null}
      <p className={styles.question}>How did the day go overall?</p>
      <FeelingFaces onPick={setFeeling} value={feeling} size="md" />
      <Field label="Note (optional)" htmlFor={noteId}>
        <textarea
          id={noteId}
          className={styles.textarea}
          rows={3}
          maxLength={2000}
          placeholder="Calm morning, the bus was hard."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <BigButton variant="primary" fullWidth disabled={!feeling} onClick={() => void save()}>
        Save check-up
      </BigButton>
    </div>
  );
}

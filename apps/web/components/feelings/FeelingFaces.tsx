'use client';

import type { Feeling } from '@chipperly/shared/schemas/attitude';
import { FEELINGS } from '@/lib/data/feelings';
import styles from './FeelingFaces.module.css';

export interface FeelingFacesProps {
  onPick: (feeling: Feeling) => void;
  /** Highlights the chosen face (the team check-up keeps its choice on screen). */
  value?: Feeling | null;
  size?: 'md' | 'lg';
}

/** The five faces, left (very upset) to right (great). Pictures only; each button's name is its label. */
export function FeelingFaces({ onPick, value, size = 'lg' }: FeelingFacesProps) {
  return (
    <div className={[styles.faces, styles[size]].join(' ')} role="group" aria-label="How it felt">
      {FEELINGS.map((f) => (
        <button
          key={f.feeling}
          type="button"
          className={styles.face}
          aria-label={f.label}
          aria-pressed={value === undefined ? undefined : value === f.feeling}
          onClick={() => onPick(f.feeling)}
        >
          <span aria-hidden="true">{f.emoji}</span>
        </button>
      ))}
    </div>
  );
}

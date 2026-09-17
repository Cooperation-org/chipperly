'use client';

import { useEffect } from 'react';
import type { AttitudeValue } from '@chipperly/shared/schemas/attitude';
import { recordAttitude } from '@/lib/data/attitude';
import styles from './AttitudePrompt.module.css';

export interface AttitudePromptProps {
  profileId: string;
  itemId: string;
  onDone: () => void;
}

const FADE_MS = 10_000;

/**
 * S32's inline "How did it go?" prompt: two large tiles, no text beyond the
 * labels. Records an `attitude_checks` row on a tap; fades after ten
 * seconds either way (`onDone` just removes it from the parent's set, so
 * under reduced motion it disappears instantly with no separate case to code).
 */
export function AttitudePrompt({ profileId, itemId, onDone }: AttitudePromptProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  function handlePick(value: AttitudeValue): void {
    void recordAttitude(profileId, itemId, value);
    onDone();
  }

  return (
    <div className={styles.prompt}>
      <p className={styles.question}>How did it go?</p>
      <div className={styles.tiles}>
        <button type="button" className={styles.tile} onClick={() => handlePick('good')} aria-label="Good">
          <span aria-hidden="true">🙂</span>
        </button>
        <button type="button" className={styles.tile} onClick={() => handlePick('grumpy')} aria-label="Grumpy">
          <span aria-hidden="true">😠</span>
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import type { Feeling } from '@chipperly/shared/schemas/attitude';
import { recordFeeling } from '@/lib/data/feelings';
import { FeelingFaces } from '@/components/feelings/FeelingFaces';
import styles from './AttitudePrompt.module.css';

export interface AttitudePromptProps {
  profileId: string;
  itemId: string;
  onDone: () => void;
}

const FADE_MS = 10_000;

/**
 * S32's inline "How did it feel?" prompt after a task: five faces, no text
 * beyond the question. Records a `task` feeling on a tap; fades after ten
 * seconds either way (`onDone` just removes it from the parent's set, so
 * under reduced motion it disappears instantly with no separate case to code).
 */
export function AttitudePrompt({ profileId, itemId, onDone }: AttitudePromptProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  function handlePick(feeling: Feeling): void {
    void recordFeeling(profileId, { feeling, kind: 'task', itemId });
    onDone();
  }

  return (
    <div className={styles.prompt}>
      <p className={styles.question}>How did it feel?</p>
      <FeelingFaces onPick={handlePick} />
    </div>
  );
}

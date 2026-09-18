'use client';

import type { ReactNode } from 'react';
import { ListRow } from './ListRow';
import { CheckCircle } from './CheckCircle';
import { IconButton } from './IconButton';
import styles from './StepRow.module.css';

export interface StepRowProps {
  tile: ReactNode;
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Minutes for this step, when it has a timer; omit/null for an untimed step. */
  durationMinutes?: number | null;
  /** Present only when a "Start timer" affordance should show next to a timed step. */
  onStartTimer?: () => void;
}

/** A step inside an expanded activity: an indented ListRow with no handle, its own CheckCircle. */
export function StepRow({ tile, name, checked, onChange, durationMinutes, onStartTimer }: StepRowProps) {
  const timed = durationMinutes != null && durationMinutes > 0;
  return (
    <div className={styles.indent}>
      <ListRow
        tile={tile}
        name={name}
        secondary={timed ? `${durationMinutes} min` : undefined}
        dimmed={checked}
        trailing={
          <span className={styles.trailing}>
            {timed && onStartTimer ? (
              <IconButton icon="timer" aria-label={`Start ${durationMinutes} minute timer for ${name}`} onClick={onStartTimer} />
            ) : null}
            <CheckCircle checked={checked} onChange={onChange} name={name} />
          </span>
        }
      />
    </div>
  );
}

'use client';

import type { CSSProperties, ReactNode } from 'react';
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
  /** Nesting depth within a step tree (0 = top-level); indents an extra 16px per level on top of the base indent. */
  depth?: number;
  /** Whether this step has its own sub-steps; shows a chevron that calls `onToggle`. */
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Present only when a step with sub-steps should offer opening them as a full-screen visual schedule. */
  onOpenVisualSchedule?: () => void;
}

/** A step inside an expanded activity: an indented ListRow with no handle, its own CheckCircle. */
export function StepRow({
  tile,
  name,
  checked,
  onChange,
  durationMinutes,
  onStartTimer,
  depth = 0,
  hasChildren,
  expanded,
  onToggle,
  onOpenVisualSchedule,
}: StepRowProps) {
  const timed = durationMinutes != null && durationMinutes > 0;
  return (
    <div className={styles.indent} style={{ '--depth': depth } as CSSProperties}>
      <ListRow
        tile={tile}
        name={name}
        secondary={timed ? `${durationMinutes} min` : undefined}
        dimmed={checked}
        onTap={hasChildren && onToggle ? onToggle : () => onChange(!checked)}
        trailing={
          <span className={styles.trailing}>
            {hasChildren && onToggle ? (
              <IconButton
                icon="chevron"
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name} sub-steps`}
                aria-expanded={expanded}
                className={expanded ? styles.chevronOpen : undefined}
                onClick={onToggle}
              />
            ) : null}
            {onOpenVisualSchedule ? (
              <IconButton icon="expand" aria-label={`Open ${name} as visual schedule`} onClick={onOpenVisualSchedule} />
            ) : null}
            {timed && onStartTimer ? (
              <IconButton icon="timer" aria-label={`Start ${durationMinutes} minute timer for ${name}`} onClick={onStartTimer} />
            ) : null}
            <CheckCircle checked={checked} onChange={onChange} name={name} size="sm" />
          </span>
        }
      />
    </div>
  );
}

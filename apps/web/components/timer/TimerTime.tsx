'use client';

import { formatTimerTime } from './time';
import styles from './TimerTime.module.css';

export interface TimerTimeProps {
  remaining_ms: number;
  /** When given, the time is a button. */
  onEdit?: () => void;
  /** What tapping actually does, for the accessible name. */
  editLabel?: string;
  large?: boolean;
}

/** The countdown digits, shown outside the reveal picture. */
export function TimerTime({ remaining_ms, onEdit, editLabel = 'Change duration', large }: TimerTimeProps) {
  const text = formatTimerTime(remaining_ms);
  const className = [styles.time, large ? styles.large : ''].filter(Boolean).join(' ');
  if (!onEdit) return <span className={className}>{text}</span>;
  return (
    <button type="button" className={`${className} ${styles.edit}`} onClick={onEdit} aria-label={`Timer, ${text} remaining. ${editLabel}`}>
      {text}
    </button>
  );
}

'use client';

import { ChipStar } from './ChipStar';
import styles from './CheckCircle.module.css';

export interface CheckCircleProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** The thing being checked, e.g. "Brush teeth" — the announced label becomes "Brush teeth, checked". */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

/** A real checkbox styled as a circle; checked, it becomes the brand star with a tick on the disc. */
export function CheckCircle({ checked, onChange, name, size = 'md', disabled, className }: CheckCircleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${name}, ${checked ? 'checked' : 'not checked'}`}
      disabled={disabled}
      className={[styles.circle, styles[size], checked ? styles.checked : '', className].filter(Boolean).join(' ')}
      onClick={() => onChange?.(!checked)}
    >
      <ChipStar size="100%" className={styles.star} />
      <svg viewBox="0 0 24 24" className={styles.tick} fill="none" aria-hidden="true">
        <polyline
          points="5 13 10 18 19 7"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.checkmark}
        />
      </svg>
    </button>
  );
}

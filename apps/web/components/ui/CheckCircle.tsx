'use client';

import styles from './CheckCircle.module.css';

export interface CheckCircleProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** The thing being checked, e.g. "Brush teeth" — the announced label becomes "Brush teeth, checked". */
  name: string;
  size?: 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

/** A real checkbox styled as a circle. Fills with a 220ms draw when motion is on. */
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
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" aria-hidden="true">
        <polyline
          points="5 13 10 18 19 7"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.checkmark}
        />
      </svg>
    </button>
  );
}

'use client';

import { ChipStar } from './ChipStar';
import styles from './CheckCircle.module.css';

export interface CheckCircleProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** The thing being checked, e.g. "Brush teeth" — the announced label becomes "Brush teeth, checked". */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** 0 to 1 while a routine's steps are being done: lights that share of the star's 12 rays before it's checked. */
  progress?: number;
  disabled?: boolean;
  className?: string;
}

/** A real checkbox styled as a circle; checked, it becomes the brand star with a tick on the disc. */
export function CheckCircle({ checked, onChange, name, size = 'md', progress, disabled, className }: CheckCircleProps) {
  const rays = !checked && progress !== undefined && progress > 0 ? Math.min(11, Math.round(progress * 12)) : undefined;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${name}, ${checked ? 'checked' : 'not checked'}`}
      disabled={disabled}
      className={[styles.circle, styles[size], checked ? styles.checked : '', rays ? styles.partial : '', className].filter(Boolean).join(' ')}
      onClick={() => onChange?.(!checked)}
    >
      <ChipStar size="100%" rays={rays} className={styles.star} />
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

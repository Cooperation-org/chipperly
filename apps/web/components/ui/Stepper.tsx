'use client';

import { IconButton } from './IconButton';
import styles from './Stepper.module.css';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  step?: number;
  /** Accessible name for the group, e.g. "Chips earned". */
  label: string;
}

/** − value + with a large value. Used for chip cost, reward cost, goal. */
export function Stepper({ value, min, max, onChange, step = 1, label }: StepperProps) {
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <IconButton icon="minus" aria-label="Decrease" variant="muted" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} />
      <span
        className={styles.value}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
      >
        {value}
      </span>
      <IconButton icon="plus" aria-label="Increase" variant="muted" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} />
    </div>
  );
}

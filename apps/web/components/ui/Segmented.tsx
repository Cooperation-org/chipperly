'use client';

import { VisuallyHidden } from './VisuallyHidden';
import styles from './Segmented.module.css';

export interface SegmentedItem {
  value: string;
  label: string;
}

export interface SegmentedProps {
  items: SegmentedItem[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group or, above 4 items, the fallback select. */
  label: string;
}

/** Up to 4 items as a radio group; a native <select> above that. Location, part of day, role. */
export function Segmented({ items, value, onChange, label }: SegmentedProps) {
  if (items.length > 4) {
    return (
      <label className={styles.selectWrap}>
        <VisuallyHidden>{label}</VisuallyHidden>
        <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={[styles.segment, active ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

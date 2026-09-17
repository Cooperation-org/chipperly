'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import styles from './FormRow.module.css';

export interface FormRowProps {
  label: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** S9 / S19: one field as a row that expands when tapped, collapsed to a label + summary otherwise. */
export function FormRow({ label, summary, open, onToggle, children }: FormRowProps) {
  return (
    <div className={styles.row}>
      <button type="button" className={styles.summaryButton} onClick={onToggle} aria-expanded={open}>
        <span className={styles.label}>{label}</span>
        <span className={styles.summary}>{summary}</span>
        <Icon name="chevron" size={20} className={open ? styles.chevronOpen : styles.chevron} />
      </button>
      {open ? <div className={styles.panel}>{children}</div> : null}
    </div>
  );
}

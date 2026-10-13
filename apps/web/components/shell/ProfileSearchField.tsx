'use client';

import styles from './ProfileSearchField.module.css';

export function ProfileSearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="search"
      className={styles.search}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search by name"
      aria-label="Search people by name"
      autoComplete="off"
      enterKeyHint="search"
    />
  );
}

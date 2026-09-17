'use client';

import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

// ponytail: CONTRACTS.md's UI primitive inventory has no toggle/switch, but
// four screens in this task need one (Settings sounds, the four lock
// options, share-link on/off). One small control here, reused across
// components/settings, components/library and components/careTeam, beats
// four bespoke checkboxes.
/** A 48x48 role="switch" control. State is shown by position and color together, never color alone. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[styles.switch, checked ? styles.on : ''].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}

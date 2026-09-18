'use client';

import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

// ponytail: CONTRACTS.md's UI primitive inventory has no toggle/switch, but
// several screens need one (Settings sounds, the four lock options,
// share-link on/off, reward "always available", timer sound). One small
// control here, reused across every feature that needs one, beats N
// bespoke hand-rolled role="switch" buttons.
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

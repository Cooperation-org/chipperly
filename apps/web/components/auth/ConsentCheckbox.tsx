'use client';

import Link from 'next/link';
import styles from './ConsentCheckbox.module.css';

export interface ConsentCheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}

/** S2's required consent checkbox (SOW Q21 / COPPA); also used inline by GoogleButton/AppleButton after a consent_required 409. */
export function ConsentCheckbox({ id = 'consent', checked, onChange, required }: ConsentCheckboxProps) {
  return (
    <label htmlFor={id} className={styles.row}>
      <input
        id={id}
        type="checkbox"
        className={styles.box}
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I&apos;m 18 or older, and I&apos;m setting Chipperly up for myself or for someone I&apos;m authorized to support. I agree to the{' '}
        <Link href="/terms/" className={styles.link}>
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy/" className={styles.link}>
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}

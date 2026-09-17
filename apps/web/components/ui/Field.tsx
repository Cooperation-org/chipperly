import type { ReactNode } from 'react';
import styles from './Field.module.css';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  /** id of the hint/error <p>, wired to the control's aria-describedby by the caller. */
  messageId?: string;
  children: ReactNode;
}

/** Label + control + hint/error, on an 8px grid. The control itself is passed as children. */
export function Field({ label, htmlFor, hint, error, messageId, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={messageId} className={styles.error} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

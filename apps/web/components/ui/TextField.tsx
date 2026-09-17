'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { Field } from './Field';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

/** A single 48px text input with its label, hint and error wired up for accessibility. */
export function TextField({ label, hint, error, className, ...rest }: TextFieldProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-msg` : undefined;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} messageId={messageId}>
      <input
        id={id}
        className={[styles.input, error ? styles.invalid : '', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        {...rest}
      />
    </Field>
  );
}

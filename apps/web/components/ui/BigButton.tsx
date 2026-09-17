'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './BigButton.module.css';

export type BigButtonVariant = 'primary' | 'secondary' | 'accent';

export interface BigButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: BigButtonVariant;
  fullWidth?: boolean;
  icon?: IconName;
  children: ReactNode;
}

/** The big, obvious action: +, −, Start, Done, Lock, Redeem. 56px minimum, display font. */
export function BigButton({
  variant = 'primary',
  fullWidth = false,
  icon,
  disabled,
  className,
  children,
  ...rest
}: BigButtonProps) {
  return (
    <button
      type="button"
      className={[styles.button, styles[variant], fullWidth ? styles.fullWidth : '', className].filter(Boolean).join(' ')}
      disabled={disabled}
      {...rest}
    >
      {icon ? <Icon name={icon} size={24} /> : null}
      {children}
    </button>
  );
}

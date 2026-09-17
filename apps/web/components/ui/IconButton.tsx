'use client';

import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName;
  /** Required: an icon button has no visible label, so this is the only one. */
  'aria-label': string;
  variant?: 'plain' | 'solid' | 'muted';
  size?: number;
}

/** A 48x48 tap target holding a single icon. Always needs an `aria-label`. */
export function IconButton({ icon, variant = 'plain', size = 24, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={[styles.button, variant !== 'plain' ? styles[variant] : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

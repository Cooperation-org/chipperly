import type { ElementType, ReactNode } from 'react';
import styles from './VisuallyHidden.module.css';

export interface VisuallyHiddenProps {
  as?: ElementType;
  children: ReactNode;
}

/** Content read by screen readers but never shown on screen. */
export function VisuallyHidden({ as: Tag = 'span', children }: VisuallyHiddenProps) {
  return <Tag className={styles.hidden}>{children}</Tag>;
}

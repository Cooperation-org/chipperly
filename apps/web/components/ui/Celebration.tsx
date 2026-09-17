'use client';

import { useEffect, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Celebration.module.css';

export type CelebrationKind = 'check' | 'redeem' | 'all_done' | 'first_then';

const ICON: Record<CelebrationKind, IconName> = {
  check: 'check',
  redeem: 'star',
  all_done: 'star',
  first_then: 'split',
};

const DOT_COUNT = 8;

export interface CelebrationProps {
  kind: CelebrationKind;
  onDone: () => void;
}

/** Soft dots for 1.2s, or a static badge under reduced motion. Decorative: the real state
 * change (a check, a redeemed reward) is already announced by the control that caused it. */
export function Celebration({ kind, onDone }: CelebrationProps) {
  useEffect(() => {
    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reduceMotion === 'true';
    const timer = setTimeout(onDone, reduceMotion ? 300 : 1200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <span className={styles.badge}>
        <Icon name={ICON[kind]} size={28} />
      </span>
      <span className={styles.dots}>
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span key={i} className={styles.dot} style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
    </div>
  );
}

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

// Redeem gets longer on screen than a plain checkmark: it carries a message
// (the reward's name), so it needs enough time to actually be read, not just
// glanced at (owner's feedback: earning the last chip and redeeming should
// both feel like something happened, not nothing).
const DURATION_MS: Record<CelebrationKind, number> = {
  check: 1200,
  redeem: 1800,
  all_done: 1200,
  first_then: 1200,
};

export interface CelebrationProps {
  kind: CelebrationKind;
  onDone: () => void;
  /** A short caption under the badge, e.g. "You got it, Ice cream! 🎉" (redeem only, so far). */
  message?: string;
}

/** Soft dots for ~1.2-1.8s, or a static badge under reduced motion. The real state
 * change (a check, a redeemed reward) is already announced by the control that caused it;
 * `message`, when given, is still decorative text (aria-hidden) for the same reason. */
export function Celebration({ kind, onDone, message }: CelebrationProps) {
  useEffect(() => {
    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reduceMotion === 'true';
    const timer = setTimeout(onDone, reduceMotion ? 300 : DURATION_MS[kind]);
    return () => clearTimeout(timer);
  }, [onDone, kind]);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <span className={styles.badgeWrap}>
        <span className={styles.badge}>
          <Icon name={ICON[kind]} size={28} />
        </span>
        <span className={styles.dots}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <span key={i} className={styles.dot} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      </span>
      {message ? <p className={styles.message}>{message}</p> : null}
    </div>
  );
}

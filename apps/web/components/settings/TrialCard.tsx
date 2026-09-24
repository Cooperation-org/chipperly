'use client';

import type { UserPublic } from '@chipperly/shared/schemas/account';
import { trialDaysLeft } from '@/lib/billing/promo';
import styles from './AccountScreen.module.css';

/** Settings > Account: days left in the free trial, and the early access code Chipperly gave this person (it applies once the trial ends). */
export function TrialCard({ user }: { user: UserPublic }) {
  if (!user.trial_ends_at) return null;
  const left = trialDaysLeft(user.trial_ends_at);
  const ends = new Date(user.trial_ends_at).toLocaleDateString([], { day: 'numeric', month: 'long' });
  const plan = user.promo?.applies_to === 'any' ? 'any plan' : 'the annual plan';
  return (
    <div className={styles.card}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Free trial</span>
        <span className={styles.fieldValue}>{left > 0 ? `${left} day${left === 1 ? '' : 's'} left (ends ${ends})` : `Ended ${ends}`}</span>
      </div>
      {user.promo ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Your early access code</span>
          <span className={styles.code}>{user.promo.code}</span>
          <span className={styles.hint}>
            {user.promo.percent_off ? `${user.promo.percent_off}% off ${plan}` : `A discount on ${plan}`}
            {left > 0 ? `, when your trial ends on ${ends}.` : '.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

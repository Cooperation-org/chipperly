'use client';

import { useState } from 'react';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import { claimPromoCode, trialDaysLeft } from '@/lib/billing/promo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import styles from './AccountScreen.module.css';

/** Settings > Account: how long the free trial has left, and the early access code (claimed, or a field to add one). */
export function TrialCard({ user }: { user: UserPublic }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function claim(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      await claimPromoCode(code);
    } catch {
      setError("That code isn't valid (or has ended).");
    } finally {
      setSaving(false);
    }
  }

  const left = user.trial_ends_at ? trialDaysLeft(user.trial_ends_at) : null;
  const ends = user.trial_ends_at ? new Date(user.trial_ends_at).toLocaleDateString([], { day: 'numeric', month: 'long' }) : '';
  return (
    <div className={styles.card}>
      {left !== null ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Free trial</span>
          <span className={styles.fieldValue}>
            {left > 0 ? `${left} day${left === 1 ? '' : 's'} left (ends ${ends})` : `Ended ${ends}`}
          </span>
        </div>
      ) : null}
      {user.promo ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Early access</span>
          <span className={styles.fieldValue}>
            {user.promo.code}
            {user.promo.percent_off ? `: ${user.promo.percent_off}% off the annual plan` : ': your discount on the annual plan is saved'}
          </span>
        </div>
      ) : (
        <div className={styles.sheet}>
          <TextField
            label="Early access code"
            autoComplete="off"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={error}
          />
          <Button variant="secondary" onClick={() => void claim()} loading={saving} disabled={!code.trim()}>
            Add code
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth/session';
import { IconButton } from '@/components/ui/IconButton';
import styles from './VerifyBanner.module.css';

const DISMISS_KEY = 'verify_banner_dismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Quiet, dismissible reminder for an unverified email, meant to be placed on
 * Today (S2: verification is never a blocking screen). Dismissal only lasts
 * the tab session; it reappears next visit until the address is verified.
 */
export function VerifyBanner() {
  const { user } = useSession();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!user || user.email_verified_at !== null || dismissed) return null;

  function dismiss(): void {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sessionStorage unavailable (private window, blocked storage): the
      // banner still dismisses for this render, just not across a reload.
    }
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>Check your email to verify your address.</p>
      <IconButton icon="close" aria-label="Dismiss" onClick={dismiss} />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startSaveWork, useSession } from '@/lib/auth/session';
import { GUEST_STARTED_AT_KEY } from '@/lib/auth/guest';
import { guestTimeLeftLabel, isGuestEndingSoon } from '@/lib/auth/guestExpiry';
import { setKv, useKv, useKvLoaded } from '@/lib/db/kv';
import { IconButton } from '@/components/ui/IconButton';
import styles from './GuestBanner.module.css';

/** Saved in kv, so it stays dismissed across reloads. Ending the guest session wipes kv, so a later guest sees it again. */
const DISMISSED_KEY = 'guest_banner_dismissed';

/** Shown on the caregiver and child shells while trying the app as a guest. */
export function GuestBanner() {
  const { guest } = useSession();
  const router = useRouter();
  const startedAt = useKv<number | null>(GUEST_STARTED_AT_KEY, null);
  const dismissed = useKv<boolean>(DISMISSED_KEY, false);
  const dismissedLoaded = useKvLoaded(DISMISSED_KEY);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Wait for the saved choice, or a dismissed banner would flash on every load.
  if (!guest || startedAt === null || !dismissedLoaded) return null;
  // In the last 12 hours it comes back and cannot be dismissed: this is the only warning before the trial is erased.
  const endingSoon = isGuestEndingSoon(startedAt, now);
  if (dismissed && !endingSoon) return null;

  // Keeps the guest's work: sign-up moves it into the new account.
  async function createAccount(): Promise<void> {
    await startSaveWork();
    router.push('/sign-up/');
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>
        Trying Chipperly. Erased in {guestTimeLeftLabel(startedAt, now)}.{endingSoon ? ' What you made here will be gone unless you save it.' : ''}{' '}
        <button type="button" className={styles.create} onClick={() => void createAccount()}>
          Save my work
        </button>
      </p>
      {endingSoon ? null : <IconButton icon="close" aria-label="Dismiss" onClick={() => void setKv<boolean>(DISMISSED_KEY, true)} />}
    </div>
  );
}

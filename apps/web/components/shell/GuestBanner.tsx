'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { endGuestSession, useSession } from '@/lib/auth/session';
import { GUEST_STARTED_AT_KEY } from '@/lib/auth/guest';
import { guestTimeLeftLabel } from '@/lib/auth/guestExpiry';
import { useKv } from '@/lib/db/kv';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import styles from './GuestBanner.module.css';

const DISMISS_KEY = 'guest_banner_dismissed';

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Shown on the caregiver and child shells while trying the app as a guest. Dismissal lasts the tab session. */
export function GuestBanner() {
  const { guest } = useSession();
  const router = useRouter();
  const startedAt = useKv<number | null>(GUEST_STARTED_AT_KEY, null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!guest || startedAt === null || dismissed) return null;

  function dismiss(): void {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sessionStorage unavailable: the banner still dismisses for this render.
    }
  }

  // Erases the sample data first: a guest's rows can't move into an account (they'd count as foreign on sign-in anyway).
  async function createAccount(): Promise<void> {
    await endGuestSession();
    router.push('/sign-up/');
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>
        Trying Chipperly. Nothing leaves this device, and it&apos;s erased in {guestTimeLeftLabel(startedAt, now)}. Create a free account to keep it.
      </p>
      <IconButton icon="close" aria-label="Dismiss" onClick={dismiss} />
      <Button className={styles.create} variant="secondary" onClick={() => void createAccount()}>
        Create account
      </Button>
    </div>
  );
}

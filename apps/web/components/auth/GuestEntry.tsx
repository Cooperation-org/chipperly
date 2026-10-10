'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { startGuestSession } from '@/lib/auth/session';
import { db } from '@/lib/db/db';
import { useKv } from '@/lib/db/kv';
import { CARRY_OVER_KEY } from '@/lib/auth/carryOver';
import { GUEST_EXPIRED_NOTICE_KEY } from '@/lib/auth/guest';
import { Button } from '@/components/ui/Button';
import styles from './GuestEntry.module.css';

/** "Try it without an account" for the sign-in and sign-up pages (only shown signed out). */
export function GuestEntry() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Sign-out keeps unsent edits on the device; starting a guest wipes the device, so don't offer it over them.
  const unsent = useLiveQuery(() => db.outbox.count(), []);
  // A trial waiting to be saved would be erased by starting a new one.
  const saving = useKv<unknown>(CARRY_OVER_KEY, null);
  // The last trial on this device ran out: say so, or its erased work looks like something went wrong.
  const expired = useKv<boolean>(GUEST_EXPIRED_NOTICE_KEY, false);
  if (saving) {
    return (
      <div className={styles.wrap}>
        <p className={styles.note}>Your trial work is saved when you create a new account here. Signing in to an account you already have erases it.</p>
      </div>
    );
  }
  if (unsent !== 0) return null;

  async function start(): Promise<void> {
    setLoading(true);
    setError(false);
    try {
      await startGuestSession();
      router.replace('/today/');
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {expired ? (
        <p className={styles.note} role="status">
          Your 48-hour trial ended, so what you made in it was erased from this device. Create an account to keep your work.
        </p>
      ) : null}
      <Button variant="secondary" fullWidth loading={loading} onClick={() => void start()}>
        Try it without an account
      </Button>
      <p className={styles.note}>Nothing is saved to our servers. It&apos;s erased from this device after 48 hours.</p>
      {error ? (
        <p className={styles.error} role="alert">
          Couldn&apos;t start the trial on this device. Try again.
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { startGuestSession } from '@/lib/auth/session';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/Button';
import styles from './GuestEntry.module.css';

/** "Try it without an account" for the sign-in and sign-up pages (only shown signed out). */
export function GuestEntry() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Sign-out keeps unsent edits on the device; starting a guest wipes the device, so don't offer it over them.
  const unsent = useLiveQuery(() => db.outbox.count(), []);
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

'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { retryCarryOver, skipCarryOver, useSession } from '@/lib/auth/session';
import { CARRY_NOTICE_KEY, useCarryOverPhase } from '@/lib/auth/carryOver';
import { db } from '@/lib/db/db';
import { useKv } from '@/lib/db/kv';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import styles from './CarryOverScreen.module.css';

const NOTICES = {
  saved: 'Your work is saved to your account.',
  discarded: "You signed in to an existing account, so the trial work wasn't added to it.",
} as const;

/**
 * Covers the app while a guest's work moves into their new account, so nobody sees half of it or a blank
 * page. A failure shows here with a retry; the work stays on the device. Also shows the one-time toast
 * once it is over (kv `carry_over_notice`), and lands a move that finished on its own (a retry, or the
 * app reopened mid-way) on Today.
 */
export function CarryOverScreen() {
  const phase = useCarryOverPhase();
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const notice = useKv<keyof typeof NOTICES | null>(CARRY_NOTICE_KEY, null);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (phase !== 'idle') wasBusy.current = true;
    else if (wasBusy.current && notice === 'saved') {
      wasBusy.current = false;
      router.replace('/today/');
    }
  }, [phase, notice, router]);

  // The toast clears itself when the path changes, so wait until the page has settled.
  useEffect(() => {
    if (!notice || status !== 'signed_in' || phase !== 'idle') return;
    const timer = setTimeout(() => {
      toast(NOTICES[notice]);
      void db.kv.delete(CARRY_NOTICE_KEY);
    }, 800);
    return () => clearTimeout(timer);
  }, [notice, status, phase, pathname]);

  if (phase === 'idle') return null;
  return (
    <div className={styles.screen} role="alertdialog" aria-modal="true" aria-labelledby="carry-over-title">
      <h1 id="carry-over-title" className={styles.title}>
        {phase === 'saving' ? 'Saving your work...' : "Couldn't save your work"}
      </h1>
      {phase === 'saving' ? (
        <p className={styles.text}>This takes a moment.</p>
      ) : (
        <>
          <p className={styles.text}>Your work is still on this device. Check your connection and try again.</p>
          <div className={styles.actions}>
            <Button onClick={() => void retryCarryOver()}>Try again</Button>
            <Button variant="ghost" onClick={() => void skipCarryOver()}>
              Start without it
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

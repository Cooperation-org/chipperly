'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth/session';
import { useSyncStatus } from '@/lib/sync/engine';
import { unsavedNotice } from '@/lib/sync/parked';
import styles from './UnsavedBanner.module.css';

export interface UnsavedBannerProps {
  /** Opens the sync sheet, where the changes can be sent again or saved to a file. Left out where there is no sheet to open. */
  onOpen?: () => void;
}

/**
 * Says, in words and where a caregiver will see it, that this device holds
 * work the account does not have. It cannot be dismissed: it goes when the
 * changes are saved. Shown on the caregiver shell and on the unlock screen,
 * since a phone kept in the child view never shows the shell.
 */
export function UnsavedBanner({ onOpen }: UnsavedBannerProps) {
  const { guest } = useSession();
  const status = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (guest) return null;
  const notice = unsavedNotice(status, now);
  if (!notice) return null;

  return (
    <div className={styles.banner} role="alert">
      <p className={styles.text}>
        {notice.message}{' '}
        {onOpen ? (
          <button type="button" className={styles.open} onClick={onOpen}>
            See what to do
          </button>
        ) : null}
      </p>
    </div>
  );
}

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLock, useLockLoaded } from '@/lib/device/settings';
import styles from './ChildShell.module.css';

/** Child route-group shell (CONTRACTS.md "Layout rules"): no tabs, 720px column, locked-profile only. */
export function ChildShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { locked_profile_id } = useLock();
  // `useLock`'s Dexie live query resolves after this mounts (slower on
  // webkit); redirecting on its loading-tick fallback bounced a genuinely
  // locked device back to /today/ before the real row arrived. Wait for the
  // query to actually resolve before deciding there's no lock.
  const lockLoaded = useLockLoaded();

  useEffect(() => {
    document.documentElement.dataset.mode = 'child';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, []);

  useEffect(() => {
    if (lockLoaded && !locked_profile_id) router.replace('/today/');
  }, [lockLoaded, locked_profile_id, router]);

  if (!locked_profile_id) return null;

  return <div className={styles.column}>{children}</div>;
}

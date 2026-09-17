'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLock } from '@/lib/device/settings';
import styles from './ChildShell.module.css';

/** Child route-group shell (CONTRACTS.md "Layout rules"): no tabs, 720px column, locked-profile only. */
export function ChildShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { locked_profile_id } = useLock();

  useEffect(() => {
    document.documentElement.dataset.mode = 'child';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, []);

  useEffect(() => {
    if (!locked_profile_id) router.replace('/today/');
  }, [locked_profile_id, router]);

  if (!locked_profile_id) return null;

  return <div className={styles.column}>{children}</div>;
}

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import styles from './ChildShell.module.css';

/**
 * Child route-group shell (CONTRACTS.md "Layout rules"): no tabs, 720px
 * column. This is the app's default view (lib/device/settings.ts's
 * useParentMode) -- it renders for ANY signed-in user with at least one
 * profile, whether or not the device is hard-locked (`locked_profile_id`,
 * the caregiver's explicit native-pinned kiosk mode). ChildToday itself
 * resolves which profile to show (the hard lock's target if pinned, else
 * the caregiver's active profile) and renders the same "Caregiver unlock"
 * lock button either way -- the only route into caregiver screens.
 */
export function ChildShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { profiles } = useSession();

  useEffect(() => {
    document.documentElement.dataset.mode = 'child';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, []);

  useEffect(() => {
    if (profiles.length === 0) router.replace('/onboarding/kind/');
  }, [profiles.length, router]);

  if (profiles.length === 0) return null;

  return <div className={styles.column}>{children}</div>;
}

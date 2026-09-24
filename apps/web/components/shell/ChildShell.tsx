'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import { useLock, useLockLoaded } from '@/lib/device/settings';
import { useCaregiverDevice } from '@/lib/device/role';
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
  const { status, profiles } = useSession();
  const caregiverDevice = useCaregiverDevice();
  const { locked_profile_id } = useLock();
  const lockLoaded = useLockLoaded();
  // A caregiver's device has no child view unless it's locked to a child right now.
  const toCaregiver = caregiverDevice === true && lockLoaded && !locked_profile_id;

  useEffect(() => {
    document.documentElement.dataset.mode = 'child';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, []);

  useEffect(() => {
    // Only a genuinely signed-in account can answer "does it have a
    // profile yet" -- while `status` is still 'loading' (reading the
    // cached session) or has just gone 'signed_out' (a sync 401), profiles
    // is `[]` for a reason that has nothing to do with onboarding, and
    // redirecting off that snapshot is what sent this bouncing to
    // /onboarding/kind/ and back once the real session settled again.
    if (status === 'signed_out') router.replace('/');
    else if (status === 'signed_in' && profiles.length === 0) router.replace('/onboarding/kind/');
    else if (status === 'signed_in' && toCaregiver) router.replace('/today/');
  }, [status, profiles.length, toCaregiver, router]);

  if (status !== 'signed_in' || profiles.length === 0 || toCaregiver) return null;

  return <div className={styles.column}>{children}</div>;
}

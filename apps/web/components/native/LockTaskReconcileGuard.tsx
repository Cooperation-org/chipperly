'use client';

import { useEffect } from 'react';
import { useLock, lockTo, unlock } from '@/lib/device/settings';
import { useActiveProfile } from '@/lib/profile/active';
import Kiosk from '@/lib/native/kiosk';

/**
 * Closes a gap that's real, not hypothetical: a remote Lock/Unlock (Devices
 * screen's buttons, LocateRequestMessagingService's lock_request/
 * unlock_request handlers) call startLockTask()/stopLockTask() natively with
 * no WebView open to also set/clear locked_profile_id -- so ChildToday's
 * back-navigation trap (the thing that makes Back a no-op instead of
 * walking out to a caregiver screen) never arms or never releases. Once the
 * webview *is* up (the same push brings it to the front), this reconciles
 * both directions against the one source of truth, the OS's own lock-task
 * state.
 */
export function LockTaskReconcileGuard(): null {
  const { locked_profile_id } = useLock();
  const { profile } = useActiveProfile();

  useEffect(() => {
    function reconcile(): void {
      void Kiosk.isLockTaskActive().then(({ active }) => {
        if (active && !locked_profile_id && profile) void lockTo(profile.id);
        else if (!active && locked_profile_id) void unlock();
      });
    }
    reconcile();
    document.addEventListener('visibilitychange', reconcile);
    return () => document.removeEventListener('visibilitychange', reconcile);
  }, [locked_profile_id, profile]);

  return null;
}

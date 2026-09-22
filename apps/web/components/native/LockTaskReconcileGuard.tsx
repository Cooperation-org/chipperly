'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLock, lockTo, unlock } from '@/lib/device/settings';
import { useActiveProfile } from '@/lib/profile/active';
import { getDeviceId } from '@/lib/device/identity';
import { api } from '@/lib/api/client';
import Kiosk from '@/lib/native/kiosk';

/**
 * Closes a gap that's real, not hypothetical: a remote Lock/Unlock (Devices
 * screen's buttons, LocateRequestMessagingService's lock_request/
 * unlock_request handlers) call startLockTask()/stopLockTask() natively with
 * no WebView open to also set/clear locked_profile_id -- so ChildToday's
 * back-navigation trap (the thing that makes Back a no-op instead of
 * walking out to a caregiver screen) never arms or never releases. This
 * reconciles both directions against the one source of truth, the OS's own
 * lock-task state, and reports that same state to PATCH
 * /me/devices/:id/lock-state so a caregiver on any device can actually see
 * whether this one is locked (Settings > Devices) instead of guessing from
 * whether a lock/unlock request was sent.
 *
 * Mount and visibilitychange alone aren't enough: if the webview was
 * already the foreground page when the push landed (the common case --
 * nothing backgrounded it first), neither fires. Polled on the same
 * RECHECK_INTERVAL_MS cadence ChipperlyBlockService already uses for the
 * identical "native state changed with no event to tell the webview" gap.
 */
const RECHECK_INTERVAL_MS = 20_000;

export function LockTaskReconcileGuard(): null {
  const { locked_profile_id } = useLock();
  const { profile } = useActiveProfile();
  const lastReported = useRef<boolean | null>(null);

  useEffect(() => {
    function reconcile(): void {
      void Kiosk.isLockTaskActive().then(({ active }) => {
        if (active && !locked_profile_id && profile) void lockTo(profile.id);
        else if (!active && locked_profile_id) void unlock();

        if (Capacitor.getPlatform() !== 'android' || lastReported.current === active) return;
        lastReported.current = active;
        void getDeviceId().then((deviceId) => api.patch(`/me/devices/${deviceId}/lock-state`, { locked: active }).catch(() => {}));
      });
    }
    reconcile();
    document.addEventListener('visibilitychange', reconcile);
    const interval = setInterval(reconcile, RECHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', reconcile);
      clearInterval(interval);
    };
  }, [locked_profile_id, profile]);

  return null;
}

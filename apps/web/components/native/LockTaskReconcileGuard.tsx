'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
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
  const lockedProfile = useLiveQuery(() => (locked_profile_id ? db.profiles.get(locked_profile_id) : undefined), [locked_profile_id]);
  const lastReported = useRef<boolean | null>(null);

  useEffect(() => {
    // No OS-level lock-task state exists on web (kiosk.web.ts's
    // isLockTaskActive() is a stub that always reports `active: false`), so
    // without this guard every mount/poll here read that stub as "the OS
    // dropped the lock" and called unlock(), wiping LockSheet's just-set
    // locked_profile_id and options back to defaults within ~20s -- the web
    // build's own in-app PIN lock (LockSheet/UnlockOverlay) is authoritative
    // there instead, same as kiosk.web.ts's own fallback comment says.
    if (!Capacitor.isNativePlatform()) return;
    function reconcile(): void {
      void Kiosk.isLockTaskActive().then(({ active }) => {
        if (active && !locked_profile_id && profile) void lockTo(profile.id);
        // Pinning without Device Owner is escapable by design (hold Back +
        // Recents), so "not pinned" alone doesn't mean a caregiver unlocked.
        // Both caregiver unlock paths (UnlockOverlay, POST /me/devices/:id/unlock)
        // turn child_mode_active off; a child's unpin leaves it on, and the
        // lock state stays put so the child view and blocking keep holding.
        else if (!active && locked_profile_id && lockedProfile && !lockedProfile.settings.child_mode_active) void unlock();

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
  }, [locked_profile_id, lockedProfile, profile]);

  return null;
}

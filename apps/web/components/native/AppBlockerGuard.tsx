'use client';

import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLock, useParentMode } from '@/lib/device/settings';
import { useActiveProfile } from '@/lib/profile/active';
import { db } from '@/lib/db/db';
import { now } from '@/lib/clock';
import AppBlocker from '@/lib/native/appBlocker';

/**
 * Enforces the current child's app allow-list independent of the hard
 * device pin (KioskPlugin's startLockTask): without a device-owner/DPC
 * allowlist, screen pinning has no OS concept of "pin to Chipperly, but
 * also allow these other apps" -- pinning blocks everything uniformly, so
 * gating this on locked_profile_id made the allow-list a no-op whenever
 * the device was actually locked (verified: even an explicitly-checked
 * app got the same OS-level block as an unchecked one while pinned).
 * ChipperlyBlockService's startActivity-based redirect works regardless of
 * lock-task state, so this only needs "which profile is this device
 * currently showing" -- the same locked_profile_id ?? activeProfile.id
 * fallback ChildToday already uses -- not whether it's hard-pinned.
 * child_mode_active/allowed_app_packages are plain synced profile settings
 * (lib/data -> upsert('profiles', ...)), so a caregiver flipping them from
 * any device, including their own laptop, reaches this guard through the
 * same sync pull every other setting already uses.
 */
export function AppBlockerGuard(): null {
  const { locked_profile_id } = useLock();
  const { profile: activeProfile } = useActiveProfile();
  const parentMode = useParentMode();
  const profileId = locked_profile_id ?? activeProfile?.id;
  const profile = useLiveQuery(() => (profileId ? db.profiles.get(profileId) : undefined), [profileId]);
  const lastApplied = useRef<{ enabled: boolean; packages: string; allowances: string } | null>(null);

  useEffect(() => {
    // Paused, not just permitted, while the caregiver is authenticated into
    // parent mode -- having just entered a PIN/password already proves who
    // they are, and a caregiver checking Gmail mid-review shouldn't get
    // bounced back to Chipperly by their own child-mode settings.
    const enabled = Boolean(!parentMode && profileId && profile?.settings.child_mode_active);
    const packages = enabled ? (profile?.settings.allowed_app_packages ?? []) : [];
    // Expired entries are harmless to keep sending -- the native side treats
    // anything at/past its own allowedUntil as inactive -- but there's no
    // reason to keep pushing dead ones on every render either.
    const nowMs = now();
    const allowances = enabled
      ? (profile?.settings.timed_app_allowances ?? []).filter((a) => a.allowed_until > nowMs)
      : [];

    const packagesKey = packages.join(',');
    const allowancesKey = allowances.map((a) => `${a.package_name}:${a.allowed_until}`).join(',');
    const prev = lastApplied.current;
    const same = prev && prev.enabled === enabled && prev.packages === packagesKey && prev.allowances === allowancesKey;
    if (same) return;
    lastApplied.current = { enabled, packages: packagesKey, allowances: allowancesKey };

    void AppBlocker.setAllowedPackages({ packages });
    void AppBlocker.setTimedAllowances({
      allowances: allowances.map((a) => ({ packageName: a.package_name, allowedUntil: a.allowed_until })),
    });
    void AppBlocker.setEnabled({ enabled });
  }, [
    parentMode,
    profileId,
    profile?.settings.child_mode_active,
    profile?.settings.allowed_app_packages,
    profile?.settings.timed_app_allowances,
  ]);

  return null;
}

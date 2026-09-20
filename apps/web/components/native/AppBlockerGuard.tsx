'use client';

import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLock } from '@/lib/device/settings';
import { db } from '@/lib/db/db';
import AppBlocker from '@/lib/native/appBlocker';

/**
 * Enforces the locked profile's app allow-list, whenever the device is
 * actually showing that profile's locked view AND the caregiver has that
 * profile's child_mode_active on. Unlocking (locked_profile_id -> null,
 * the existing caregiver-PIN flow in UnlockOverlay) pauses enforcement
 * immediately without touching the stored setting, so re-locking resumes
 * it automatically -- the caregiver never has to redo the allow-list.
 * child_mode_active/allowed_app_packages are plain synced profile settings
 * (lib/data -> upsert('profiles', ...)), so a caregiver flipping them from
 * any device, including their own laptop, reaches this guard through the
 * same sync pull every other setting already uses.
 */
export function AppBlockerGuard(): null {
  const { locked_profile_id } = useLock();
  const profile = useLiveQuery(
    () => (locked_profile_id ? db.profiles.get(locked_profile_id) : undefined),
    [locked_profile_id],
  );
  const lastApplied = useRef<{ enabled: boolean; packages: string[] } | null>(null);

  useEffect(() => {
    const enabled = Boolean(locked_profile_id && profile?.settings.child_mode_active);
    const packages = enabled ? (profile?.settings.allowed_app_packages ?? []) : [];

    const prev = lastApplied.current;
    const same = prev && prev.enabled === enabled && prev.packages.join(',') === packages.join(',');
    if (same) return;
    lastApplied.current = { enabled, packages };

    void AppBlocker.setAllowedPackages({ packages });
    void AppBlocker.setEnabled({ enabled });
  }, [locked_profile_id, profile?.settings.child_mode_active, profile?.settings.allowed_app_packages]);

  return null;
}

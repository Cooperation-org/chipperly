'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import AppBlocker, { type InstalledApp } from '@/lib/native/appBlocker';
import { db } from '@/lib/db/db';
import { now } from '@/lib/clock';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from './AllowedAppsSheet.module.css';

/**
 * Child-facing grid of the apps the caregiver has allowed (AppBlockingScreen's
 * allow-list), each one tap to open -- so the child has a way to reach an
 * allowed app without ever needing the system launcher (Android only;
 * AppBlockerGuard is what's actually enforcing the allow-list this reads).
 * Also lists apps a redeemed screen-time reward unlocked, with when that
 * time ends. Reads the profile live: Sheet.tsx freezes the content it's
 * given, and a grant lands by sync a moment after the redeem.
 */
export function AllowedAppsSheet({ profileId }: { profileId: string }) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const profile = useLiveQuery(() => db.profiles.get(profileId), [profileId]);

  useEffect(() => {
    void AppBlocker.listInstalledApps().then((result) => setApps(result.apps));
  }, []);

  if (apps === null || !profile) return null;

  const allowedSet = new Set(profile.settings.allowed_app_packages ?? []);
  const timedUntil = new Map(
    (profile.settings.timed_app_allowances ?? []).filter((a) => a.allowed_until > now()).map((a) => [a.package_name, a.allowed_until]),
  );
  const allowedApps = apps.filter((app) => allowedSet.has(app.packageName) || timedUntil.has(app.packageName));

  if (allowedApps.length === 0) return <EmptyState sentence="No apps are allowed right now." />;

  return (
    <ul className={styles.grid}>
      {allowedApps.map((app) => (
        <li key={app.packageName}>
          <button type="button" className={styles.tile} onClick={() => void AppBlocker.launchApp({ packageName: app.packageName })}>
            <span className={styles.icon} aria-hidden="true">
              {app.appName.charAt(0).toUpperCase()}
            </span>
            <span>{app.appName}</span>
            {!allowedSet.has(app.packageName) && timedUntil.has(app.packageName) ? (
              <span className={styles.until}>
                until {new Date(timedUntil.get(app.packageName) as number).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

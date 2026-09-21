'use client';

import { useEffect, useState } from 'react';
import AppBlocker, { type InstalledApp } from '@/lib/native/appBlocker';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from './AllowedAppsSheet.module.css';

/**
 * Child-facing grid of the apps the caregiver has allowed (AppBlockingScreen's
 * allow-list), each one tap to open -- so the child has a way to reach an
 * allowed app without ever needing the system launcher (Android only;
 * AppBlockerGuard is what's actually enforcing the allow-list this reads).
 */
export function AllowedAppsSheet({ allowedPackages }: { allowedPackages: string[] }) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);

  useEffect(() => {
    void AppBlocker.listInstalledApps().then((result) => setApps(result.apps));
  }, []);

  if (apps === null) return null;

  const allowedSet = new Set(allowedPackages);
  const allowedApps = apps.filter((app) => allowedSet.has(app.packageName));

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
          </button>
        </li>
      ))}
    </ul>
  );
}

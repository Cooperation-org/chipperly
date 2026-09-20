'use client';

import { useEffect, useState } from 'react';
import type { InstalledApp } from '@/lib/native/appBlocker';
import AppBlocker from '@/lib/native/appBlocker';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { Switch } from '@/components/ui/Switch';
import { upsert } from '@/lib/sync/mutate';
import { useActiveProfile } from '@/lib/profile/active';
import styles from './AppBlockingScreen.module.css';

/**
 * Caregiver-facing allow-list for Android's app-blocking accessibility
 * service. AppBlockerGuard (components/native) is what actually applies
 * whatever's saved here, whenever the device is locked to this profile --
 * this screen only ever reads/writes the profile's settings and asks the
 * plugin about the service's own on/off state.
 *
 * Android only: listInstalledApps()/isServiceEnabled() are no-ops on
 * web/iOS (lib/native/appBlocker.web.ts), so `apps` stays empty there and
 * this renders a plain explanatory note instead of an empty list.
 */
export function AppBlockingScreen() {
  const { profile } = useActiveProfile();
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [apps, setApps] = useState<InstalledApp[]>([]);

  useEffect(() => {
    function refreshServiceState(): void {
      void AppBlocker.isServiceEnabled().then(({ enabled }) => setServiceEnabled(enabled));
    }
    refreshServiceState();
    void AppBlocker.listInstalledApps().then((result) => setApps(result.apps));

    // The caregiver leaves for system Settings to flip the service on, then
    // comes back to this same page -- recheck when that happens instead of
    // making them reload.
    function onVisible(): void {
      if (document.visibilityState === 'visible') refreshServiceState();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!profile) return null;

  const childModeActive = profile.settings.child_mode_active ?? false;
  const allowed = new Set(profile.settings.allowed_app_packages ?? []);

  async function patchSettings(patch: { child_mode_active?: boolean; allowed_app_packages?: string[] }): Promise<void> {
    if (!profile) return;
    await upsert('profiles', { ...profile, settings: { ...profile.settings, ...patch } });
  }

  function toggleAllowed(packageName: string): void {
    const next = new Set(allowed);
    if (next.has(packageName)) next.delete(packageName);
    else next.add(packageName);
    void patchSettings({ allowed_app_packages: Array.from(next) });
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Accessibility service</span>
          <span className={[styles.badge, serviceEnabled ? styles.on : styles.off].join(' ')}>
            {serviceEnabled ? 'On' : 'Off'}
          </span>
        </div>
        <p className={styles.hint}>
          {serviceEnabled
            ? "It's on, so Chipperly can bring itself back to the front when a non-allowed app opens."
            : 'Turn this on in system Settings so Chipperly can bring itself back to the front when a non-allowed app opens. Android will show you exactly what it does before you turn it on.'}
        </p>
        {!serviceEnabled ? (
          <Button variant="secondary" onClick={() => void AppBlocker.openAccessibilitySettings()}>
            Open accessibility settings
          </Button>
        ) : null}
      </div>

      <div className={styles.card}>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Only allow apps below</span>
          <Switch
            label="Only allow apps below"
            checked={childModeActive}
            onChange={(v) => void patchSettings({ child_mode_active: v })}
          />
        </div>
        <p className={styles.hint}>
          While this device is locked to {profile.name}, only Chipperly and the apps checked below can open. You can
          always unlock with your PIN, on/off setting or not.
        </p>
      </div>

      {apps.length === 0 ? (
        <EmptyState sentence="App blocking only works in the Android app. This device can't list installed apps." />
      ) : (
        <div className={styles.card}>
          {apps.map((app) => (
            <ListRow
              key={app.packageName}
              tile={
                <span className={styles.appTile} aria-hidden="true">
                  {app.appName.charAt(0).toUpperCase()}
                </span>
              }
              name={app.appName}
              secondary={app.packageName}
              trailing={<CheckCircle checked={allowed.has(app.packageName)} onChange={() => toggleAllowed(app.packageName)} name={app.appName} />}
              onTap={() => toggleAllowed(app.packageName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

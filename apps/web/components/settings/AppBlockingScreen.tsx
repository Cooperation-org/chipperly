'use client';

import { useEffect, useState } from 'react';
import type { TimedAppAllowance } from '@chipperly/shared/schemas/profile';
import type { InstalledApp } from '@/lib/native/appBlocker';
import AppBlocker from '@/lib/native/appBlocker';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Switch } from '@/components/ui/Switch';
import { useSheet } from '@/components/ui/Sheet';
import { now } from '@/lib/clock';
import { upsert } from '@/lib/sync/mutate';
import { useActiveProfile } from '@/lib/profile/active';
import styles from './AppBlockingScreen.module.css';

/** Quick-grant durations for a timed app allowance, e.g. "allow YouTube for 1 hour". */
const DURATIONS_MIN = [15, 30, 60, 120];

/**
 * Caregiver-facing allow-list for Android's app-blocking accessibility
 * service. AppBlockerGuard (components/native) is what actually applies
 * whatever's saved here, independent of whether the device is also hard-
 * locked (KioskPlugin) -- this screen only ever reads/writes the profile's
 * settings and asks the plugin about the service's own on/off state.
 *
 * Android only: listInstalledApps()/isServiceEnabled() are no-ops on
 * web/iOS (lib/native/appBlocker.web.ts), so `apps` stays empty there and
 * this renders a plain explanatory note instead of an empty list.
 */
export function AppBlockingScreen() {
  const { profile } = useActiveProfile();
  const sheet = useSheet();
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
  const timedAllowances = profile.settings.timed_app_allowances ?? [];

  async function patchSettings(patch: {
    child_mode_active?: boolean;
    allowed_app_packages?: string[];
    timed_app_allowances?: TimedAppAllowance[];
  }): Promise<void> {
    if (!profile) return;
    await upsert('profiles', { ...profile, settings: { ...profile.settings, ...patch } });
  }

  function toggleAllowed(packageName: string): void {
    const next = new Set(allowed);
    if (next.has(packageName)) next.delete(packageName);
    else next.add(packageName);
    void patchSettings({ allowed_app_packages: Array.from(next) });
  }

  function activeAllowanceFor(packageName: string): TimedAppAllowance | undefined {
    return timedAllowances.find((a) => a.package_name === packageName && a.allowed_until > now());
  }

  function grantTimedAllowance(packageName: string, minutes: number): void {
    const rest = timedAllowances.filter((a) => a.package_name !== packageName);
    void patchSettings({
      timed_app_allowances: [...rest, { package_name: packageName, allowed_until: now() + minutes * 60_000 }],
    });
    sheet.close();
  }

  function revokeTimedAllowance(packageName: string): void {
    void patchSettings({ timed_app_allowances: timedAllowances.filter((a) => a.package_name !== packageName) });
    sheet.close();
  }

  function openTimedAllowanceSheet(app: InstalledApp): void {
    const active = activeAllowanceFor(app.packageName);
    sheet.open(
      <div className={styles.timedSheet}>
        {allowed.has(app.packageName) ? (
          <p className={styles.hint}>{app.appName} is always allowed -- timed access is only for apps that aren&rsquo;t.</p>
        ) : (
          <>
            {active ? (
              <p className={styles.hint}>
                Allowed until {new Date(active.allowed_until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
              </p>
            ) : null}
            {DURATIONS_MIN.map((minutes) => (
              <BigButton key={minutes} variant="secondary" onClick={() => grantTimedAllowance(app.packageName, minutes)}>
                Allow for {minutes < 60 ? `${minutes} min` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}
              </BigButton>
            ))}
            {active ? (
              <Button variant="danger" fullWidth onClick={() => revokeTimedAllowance(app.packageName)}>
                Remove timed access now
              </Button>
            ) : null}
          </>
        )}
      </div>,
      { title: app.appName },
    );
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
          Only Chipperly and the apps checked below can open on this device while it&rsquo;s showing {profile.name}
          &rsquo;s view. It pauses whenever you unlock into your own caregiver view, and locking the device isn&rsquo;t
          required -- the two settings work independently.
        </p>
        {childModeActive && !serviceEnabled ? (
          <p className={styles.warning} role="alert">
            This is on, but the accessibility service above isn&rsquo;t enabled yet -- nothing is actually blocked
            until you turn that on too.
          </p>
        ) : null}
      </div>

      {apps.length === 0 ? (
        <EmptyState sentence="App blocking only works in the Android app. This device can't list installed apps." />
      ) : (
        <div className={styles.card}>
          {apps.map((app) => {
            const active = activeAllowanceFor(app.packageName);
            return (
              <ListRow
                key={app.packageName}
                tile={
                  <span className={styles.appTile} aria-hidden="true">
                    {app.appName.charAt(0).toUpperCase()}
                  </span>
                }
                name={app.appName}
                secondary={
                  active
                    ? `${app.packageName} -- until ${new Date(active.allowed_until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : app.packageName
                }
                trailing={
                  <span className={styles.trailingRow}>
                    <IconButton
                      icon="clock"
                      aria-label={`Timed access for ${app.appName}`}
                      variant={active ? 'solid' : 'muted'}
                      onClick={() => openTimedAllowanceSheet(app)}
                    />
                    <CheckCircle checked={allowed.has(app.packageName)} onChange={() => toggleAllowed(app.packageName)} name={app.appName} />
                  </span>
                }
                onTap={() => toggleAllowed(app.packageName)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

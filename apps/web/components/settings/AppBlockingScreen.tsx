'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { TimedAppAllowance } from '@chipperly/shared/schemas/profile';
import type { Device } from '@chipperly/shared/schemas/device';
import AppBlocker from '@/lib/native/appBlocker';
import DeviceLocator from '@/lib/native/deviceLocator';
import type { LocationPermissionState } from '@/lib/native/deviceLocator';
import { api } from '@/lib/api/client';
import { getDeviceId } from '@/lib/device/identity';
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

interface AppRow {
  packageName: string;
  appName: string;
}

/**
 * Caregiver-facing allow-list for Android's app-blocking accessibility
 * service. AppBlockerGuard (components/native) is what actually applies
 * whatever's saved here, independent of whether the device is also hard-
 * locked (KioskPlugin) -- this screen only ever reads/writes the profile's
 * settings and asks the plugin about the service's own on/off state.
 *
 * The app list itself comes from GET /me/devices' installed_apps
 * (DeviceRegistrationGuard reports it, Android only), not a local native
 * call: that's what lets a caregiver on a *different* device (their
 * laptop) pick one of the child's Android devices and see its real apps,
 * instead of this screen only ever working from the device it's
 * physically opened on.
 */
export function AppBlockingScreen() {
  const { profile } = useActiveProfile();
  const sheet = useSheet();
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [deviceAdmin, setDeviceAdmin] = useState(false);
  const [deviceOwner, setDeviceOwner] = useState(false);
  const [locationPerms, setLocationPerms] = useState<LocationPermissionState>({ foreground: false, background: false });
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);

  useEffect(() => {
    void getDeviceId().then(setThisDeviceId);
  }, []);

  useEffect(() => {
    async function refreshDevices(): Promise<void> {
      const res = await api.get<{ devices: Device[] }>('/me/devices');
      const androidDevices = res.devices.filter((d) => d.platform === 'android');
      setDevices(androidDevices);
      setSelectedDeviceId((prev) => (prev && androidDevices.some((d) => d.id === prev) ? prev : androidDevices[0]?.id ?? null));
    }
    function refreshServiceState(): void {
      void AppBlocker.isServiceEnabled().then(({ enabled }) => setServiceEnabled(enabled));
      void AppBlocker.getTamperProofState().then(({ deviceAdmin: admin, deviceOwner: owner }) => {
        setDeviceAdmin(admin);
        setDeviceOwner(owner);
      });
      void DeviceLocator.getLocationPermissionState().then(setLocationPerms);
    }
    refreshServiceState();
    void refreshDevices();

    // The caregiver leaves for system Settings to flip the service on, then
    // comes back to this same page -- recheck when that happens instead of
    // making them reload.
    function onVisible(): void {
      if (document.visibilityState === 'visible') refreshServiceState();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!profile || devices === null) return null;

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;
  const isThisDevice = Capacitor.getPlatform() === 'android' && selectedDeviceId === thisDeviceId;
  const apps: AppRow[] = (selectedDevice?.installed_apps ?? []).map((a) => ({ packageName: a.package_name, appName: a.app_name }));

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

  function openTimedAllowanceSheet(app: AppRow): void {
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
      {devices.length > 1 ? (
        <div className={styles.devicePicker}>
          {devices.map((d) => (
            <button
              key={d.id}
              type="button"
              className={[styles.deviceChip, d.id === selectedDeviceId ? styles.deviceChipActive : ''].filter(Boolean).join(' ')}
              onClick={() => setSelectedDeviceId(d.id)}
            >
              {d.name ?? 'Android device'}
            </button>
          ))}
        </div>
      ) : null}

      {isThisDevice ? (
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
      ) : selectedDevice ? (
        <div className={styles.card}>
          <p className={styles.hint}>
            Open Settings &gt; App blocking on {selectedDevice.name ?? 'this device'} itself to check whether the
            accessibility service is on, or to turn it on.
          </p>
        </div>
      ) : null}

      {isThisDevice ? (
        <div className={styles.card}>
          <div className={styles.controlRow}>
            <span className={styles.controlLabel}>Tamper-proof mode</span>
            <span className={[styles.badge, deviceAdmin || deviceOwner ? styles.on : styles.off].join(' ')}>
              {deviceOwner ? 'Active (strongest)' : deviceAdmin ? 'Active' : 'Not set up'}
            </span>
          </div>
          <p className={styles.hint}>
            {deviceOwner
              ? 'Locking this device now pins it to Chipperly and the apps allowed below at the operating-system level: no Recents, and Force Stop can’t turn blocking off.'
              : deviceAdmin
                ? 'Chipperly can’t be uninstalled without turning this off first. Android will show you the same screen if you ever want to.'
                : 'Makes Chipperly harder to remove: uninstalling will require turning this off first, from Settings > Security. Android will show you exactly what it does before you turn it on.'}
          </p>
          {!deviceAdmin && !deviceOwner ? (
            <Button variant="secondary" onClick={() => void AppBlocker.requestDeviceAdmin()}>
              Turn on tamper-proof mode
            </Button>
          ) : null}
        </div>
      ) : null}

      {isThisDevice ? (
        <div className={styles.card}>
          <div className={styles.controlRow}>
            <span className={styles.controlLabel}>Location</span>
            <span
              className={[styles.badge, locationPerms.foreground && locationPerms.background ? styles.on : styles.off].join(' ')}
            >
              {locationPerms.foreground && locationPerms.background ? 'On' : locationPerms.foreground ? 'Partial' : 'Off'}
            </span>
          </div>
          <p className={styles.hint}>
            {!locationPerms.foreground
              ? 'Needed for "Locate now" to report where this device is.'
              : !locationPerms.background
                ? '"Allow all the time" isn’t set yet, so a Locate request only works while Chipperly is already open. Open location settings and choose "Allow all the time."'
                : '"Locate now" can report this device’s position, even if Chipperly isn’t open.'}
          </p>
          {!locationPerms.foreground ? (
            <Button variant="secondary" onClick={() => void DeviceLocator.requestLocationPermission().then(setLocationPerms)}>
              Grant location access
            </Button>
          ) : !locationPerms.background ? (
            <Button variant="secondary" onClick={() => void DeviceLocator.openLocationSettings()}>
              Open location settings
            </Button>
          ) : null}
        </div>
      ) : null}
          <p className={styles.hint}>
            On some phones (Xiaomi/MIUI, and similar OEM skins) this alone isn&rsquo;t enough &mdash; also check Settings &gt;
            Apps &gt; Chipperly for an &ldquo;Autostart&rdquo; toggle and set its own battery saver to &ldquo;No
            restrictions.&rdquo;
          </p>
        </div>
      ) : null}

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
          &rsquo;s view -- this applies right away, even if you&rsquo;re still in your own caregiver view here.
          Locking or unlocking the device (here or on the device itself) turns this on and off too, so the two
          always agree; flip it here directly if you want blocking on without engaging the hard lock.
        </p>
        {childModeActive && isThisDevice && !serviceEnabled ? (
          <p className={styles.warning} role="alert">
            This is on, but the accessibility service above isn&rsquo;t enabled yet -- nothing is actually blocked
            until you turn that on too.
          </p>
        ) : null}
      </div>

      {devices.length === 0 ? (
        <EmptyState sentence="No Android device has signed in yet. Open Chipperly on the child's device once, then come back here." />
      ) : apps.length === 0 ? (
        <EmptyState sentence={`Waiting for ${selectedDevice?.name ?? 'that device'} to report its apps. Open Chipperly there once, then come back here.`} />
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

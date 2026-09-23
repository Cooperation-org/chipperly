'use client';

import { useEffect, useState } from 'react';
import type { Device } from '@chipperly/shared/schemas/device';
import { api } from '@/lib/api/client';
import { getDeviceId } from '@/lib/device/identity';
import { useActiveProfile } from '@/lib/profile/active';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { toast } from '@/lib/toast';
import styles from './DevicesScreen.module.css';

function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function defaultName(platform: Device['platform']): string {
  if (platform === 'ios') return 'iPhone/iPad';
  if (platform === 'android') return 'Android device';
  return 'Web browser';
}

/**
 * Every device that's ever signed in (packages/shared/src/schemas/device.ts),
 * visible and nameable from any of them -- the whole point being a caregiver
 * can rename "Android device" to "Benny's tablet" from their own laptop and
 * mark which child it belongs to, without touching the device itself.
 */
export function DevicesScreen() {
  const { profiles } = useActiveProfile();
  const sheet = useSheet();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);

  useEffect(() => {
    void getDeviceId().then(setThisDeviceId);
    void refresh();
  }, []);

  async function refresh(): Promise<void> {
    const res = await api.get<{ devices: Device[] }>('/me/devices');
    setDevices(res.devices);
  }

  function openEditSheet(device: Device): void {
    sheet.open(
      <DeviceEditSheet
        device={device}
        profiles={profiles}
        onSaved={() => {
          sheet.close();
          void refresh();
        }}
      />,
      { title: device.name ?? defaultName(device.platform) },
    );
  }

  if (devices === null) return null;
  if (devices.length === 0) return <EmptyState sentence="No devices have signed in yet." />;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {devices.map((device) => {
          const usedBy = profiles.find((p) => p.id === device.profile_id);
          const secondary = [
            device.id === thisDeviceId ? 'This device' : null,
            usedBy ? `Used by ${usedBy.name}` : null,
            device.platform === 'android' ? (device.locked ? 'Locked' : 'Unlocked') : null,
            `Last seen ${timeAgo(device.last_seen_at)}`,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <ListRow
              key={device.id}
              tile={
                <span className={styles.tile} aria-hidden="true">
                  {device.platform === 'web' ? '💻' : '📱'}
                </span>
              }
              name={device.name ?? defaultName(device.platform)}
              secondary={secondary}
              trailing={<Icon name="chevron" size={20} />}
              onTap={() => openEditSheet(device)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** How many times to re-poll GET /me/devices after "Locate now", spaced to cover the native side's own ~20s location-fetch timeout (LocateRequestMessagingService). */
const LOCATE_POLL_ATTEMPTS = 8;
const LOCATE_POLL_INTERVAL_MS = 3_000;

function DeviceEditSheet({
  device,
  profiles,
  onSaved,
}: {
  device: Device;
  profiles: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(device.name ?? '');
  const [profileId, setProfileId] = useState(device.profile_id);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState({
    lat: device.last_lat,
    lng: device.last_lng,
    at: device.last_location_at,
  });
  const [locating, setLocating] = useState(false);
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [locked, setLocked] = useState(device.locked);
  const usedByName = profiles.find((p) => p.id === profileId)?.name;

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await api.patch(`/me/devices/${device.id}`, { name: name.trim() || null, profile_id: profileId });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    await api.delete(`/me/devices/${device.id}`);
    onSaved();
  }

  async function locateNow(): Promise<void> {
    setLocating(true);
    const requestedAt = location.at;
    try {
      await api.post(`/me/devices/${device.id}/locate`);
      for (let attempt = 0; attempt < LOCATE_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, LOCATE_POLL_INTERVAL_MS));
        const res = await api.get<{ devices: Device[] }>('/me/devices');
        const updated = res.devices.find((d) => d.id === device.id);
        if (updated?.last_location_at && updated.last_location_at !== requestedAt) {
          setLocation({ lat: updated.last_lat, lng: updated.last_lng, at: updated.last_location_at });
          break;
        }
      }
    } finally {
      setLocating(false);
    }
  }

  /** Same poll shape as locateNow, watching `locked` instead of a location timestamp -- LockTaskReconcileGuard reports the real state back within one RECHECK_INTERVAL_MS (20s), this just waits to reflect it here instead of leaving the UI showing the pre-tap state. */
  async function pollForLockState(expected: boolean): Promise<void> {
    for (let attempt = 0; attempt < LOCATE_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, LOCATE_POLL_INTERVAL_MS));
      const res = await api.get<{ devices: Device[] }>('/me/devices');
      const updated = res.devices.find((d) => d.id === device.id);
      if (updated?.locked === expected) {
        setLocked(expected);
        break;
      }
    }
  }

  /**
   * Engages the same OS-level lock as tapping "Lock this device" there in
   * person (LocateRequestMessagingService's lock_request handler), using
   * whatever allow-list it already has synced.
   */
  async function lockNow(): Promise<void> {
    setLocking(true);
    try {
      const res = await api.post<{ ok: true; sent: boolean }>(`/me/devices/${device.id}/lock`);
      toast(res.sent ? 'Lock request sent.' : "Couldn't reach that device -- it may not have push set up yet.");
      if (res.sent) await pollForLockState(true);
    } finally {
      setLocking(false);
    }
  }

  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Rest/wake and whole-phone free time: the device applies these natively
   * from the push (so they hold through a reboot with no network), and the
   * profile setting follows through sync for the device's own screens.
   */
  async function sendPolicy(key: string, path: string, body: object, sentMessage: string): Promise<void> {
    setBusy(key);
    try {
      const res = await api.post<{ ok: true; sent: boolean }>(`/me/devices/${device.id}/${path}`, body);
      toast(res.sent ? sentMessage : "Saved, but couldn't reach that device -- it may not have push set up yet.");
    } finally {
      setBusy(null);
    }
  }

  /** The other direction of lockNow: same pattern, same handler on the device (LocateRequestMessagingService's unlock_request). */
  async function unlockNow(): Promise<void> {
    setUnlocking(true);
    try {
      const res = await api.post<{ ok: true; sent: boolean }>(`/me/devices/${device.id}/unlock`);
      toast(res.sent ? 'Unlock request sent.' : "Couldn't reach that device -- it may not have push set up yet.");
      if (res.sent) await pollForLockState(false);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className={styles.editSheet}>
      <TextField label="Name" placeholder={defaultName(device.platform)} value={name} onChange={(e) => setName(e.target.value)} />

      <p className={styles.label}>Used by</p>
      <div className={styles.profilePicker}>
        <button
          type="button"
          className={[styles.profileChip, profileId === null ? styles.profileChipActive : ''].filter(Boolean).join(' ')}
          onClick={() => setProfileId(null)}
        >
          Not assigned
        </button>
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={[styles.profileChip, profileId === p.id ? styles.profileChipActive : ''].filter(Boolean).join(' ')}
            onClick={() => setProfileId(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Button fullWidth loading={saving} onClick={() => void save()}>
        Save
      </Button>

      {device.platform === 'android' && (
        <div className={styles.locateSection}>
          <p className={styles.label}>Location</p>
          {location.lat !== null && location.lng !== null && location.at !== null ? (
            <p className={styles.locateStatus}>
              Last located {timeAgo(location.at)} --{' '}
              <a
                href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                view on map
              </a>
            </p>
          ) : (
            <p className={styles.locateStatus}>No location reported yet.</p>
          )}
          <Button fullWidth variant="secondary" loading={locating} onClick={() => void locateNow()}>
            Locate now
          </Button>
        </div>
      )}

      {device.platform === 'android' && (
        <div className={styles.locateSection}>
          <div className={styles.controlRow}>
            <p className={styles.label}>Lock</p>
            <span className={[styles.badge, locked ? styles.on : styles.off].join(' ')}>{locked ? 'Locked' : 'Unlocked'}</span>
          </div>
          <p className={styles.locateStatus}>
            Locks this device to Chipperly and whatever apps are already allowed for {usedByName ?? 'its assigned child'}
            , the same as tapping &ldquo;Lock this device&rdquo; there in person -- and turns app blocking off again on
            unlock, so every app opens normally.
          </p>
          <Button fullWidth variant="secondary" loading={locking} onClick={() => void lockNow()}>
            Lock this device
          </Button>
          <Button fullWidth variant="secondary" loading={unlocking} onClick={() => void unlockNow()}>
            Unlock this device
          </Button>

          <p className={styles.label}>Rest and free time</p>
          <p className={styles.locateStatus}>
            Resting blocks every app and shows only a resting screen, but keeps the notification bar for Wi-Fi and data. It
            stays on through a restart, even with no internet, until you wake it here or enter your PIN on the device.
          </p>
          <Button fullWidth variant="secondary" loading={busy === 'rest'} onClick={() => void sendPolicy('rest', 'rest', { resting: true }, 'Resting request sent.')}>
            Rest the phone
          </Button>
          <Button fullWidth variant="secondary" loading={busy === 'wake'} onClick={() => void sendPolicy('wake', 'rest', { resting: false }, 'Wake request sent.')}>
            Wake the phone
          </Button>
          <p className={styles.locateStatus}>Free phone: every app opens, then blocking and the lock come back on their own.</p>
          {[15, 30, 60].map((minutes) => (
            <Button
              key={minutes}
              fullWidth
              variant="secondary"
              loading={busy === `free${minutes}`}
              onClick={() => void sendPolicy(`free${minutes}`, 'free', { minutes }, `Free phone for ${minutes < 60 ? `${minutes} min` : '1 hour'} sent.`)}
            >
              Free phone for {minutes < 60 ? `${minutes} min` : '1 hour'}
            </Button>
          ))}
          <Button fullWidth variant="secondary" loading={busy === 'free0'} onClick={() => void sendPolicy('free0', 'free', { minutes: 0 }, 'End free time sent.')}>
            End free time now
          </Button>
        </div>
      )}

      <Button variant="danger" fullWidth onClick={() => void remove()}>
        Remove this device
      </Button>
    </div>
  );
}

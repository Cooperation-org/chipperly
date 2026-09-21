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

      <Button variant="danger" fullWidth onClick={() => void remove()}>
        Remove this device
      </Button>
    </div>
  );
}

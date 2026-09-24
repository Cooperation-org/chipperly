import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { api } from '../api/client';
import { db } from '../db/db';
import { getKv, setKv, useKv, useKvLoaded } from '../db/kv';
import { getDeviceId } from './identity';

/**
 * Who uses this device, asked once when someone signs in on it (and
 * changeable in Settings > This device). A caregiver device opens straight
 * to the caregiver screens with no PIN; a child's device opens in that
 * child's view. Unanswered (a device from before this existed) keeps the
 * old behaviour: the child view first, the PIN to get past it.
 */
export type DeviceRole = { kind: 'caregiver' } | { kind: 'child'; profile_id: string };

const DEVICE_ROLE_KEY = 'device_role';

/** A child uses Chipperly themselves unless a caregiver said otherwise (settings.child_uses_app, default yes). */
export function usesApp(profile: Pick<Profile, 'settings'>): boolean {
  return profile.settings.child_uses_app !== false;
}

export function useDeviceRole(): DeviceRole | null {
  return useKv<DeviceRole | null>(DEVICE_ROLE_KEY, null);
}

export async function getDeviceRole(): Promise<DeviceRole | null> {
  return (await getKv<DeviceRole | null>(DEVICE_ROLE_KEY)) ?? null;
}

/** Saves the role here and marks the device as that child's (or nobody's) on the server, so reward alerts skip a child's device. */
export async function setDeviceRole(role: DeviceRole): Promise<void> {
  await setKv<DeviceRole>(DEVICE_ROLE_KEY, role);
  try {
    await api.patch(`/me/devices/${await getDeviceId()}`, { profile_id: role.kind === 'child' ? role.profile_id : null });
  } catch {
    // ponytail: a device not registered yet just isn't marked; the local role still applies.
  }
}

/** A browser starts as a caregiver device; the app on a phone or tablet asks. */
export function asksDeviceRole(): boolean {
  return Capacitor.isNativePlatform();
}

function useLiveProfiles(): Profile[] | undefined {
  return useLiveQuery(() => db.profiles.filter((row) => row.deleted_at === null).toArray(), []);
}

/**
 * True when this device skips the child view: it was set up for a caregiver,
 * or no child on it uses the app. `undefined` while still loading, so guards
 * don't redirect on a half-read state.
 */
export function useCaregiverDevice(): boolean | undefined {
  const role = useDeviceRole();
  const roleLoaded = useKvLoaded(DEVICE_ROLE_KEY);
  const profiles = useLiveProfiles();
  if (!roleLoaded || profiles === undefined) return undefined;
  if (role?.kind === 'caregiver') return true;
  return profiles.length > 0 && !profiles.some(usesApp);
}

/** The child the child view shows: a hard lock's target, this device's child, the active profile, else the first child who uses the app. */
export function childViewProfileId(
  lockedProfileId: string | null,
  role: DeviceRole | null,
  active: Profile | undefined,
  profiles: readonly Profile[],
): string {
  if (lockedProfileId) return lockedProfileId;
  if (role?.kind === 'child' && profiles.some((p) => p.id === role.profile_id)) return role.profile_id;
  if (active && usesApp(active)) return active.id;
  return profiles.find(usesApp)?.id ?? active?.id ?? '';
}

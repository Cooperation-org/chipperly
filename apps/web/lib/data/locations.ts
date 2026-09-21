'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Location } from '@chipperly/shared/schemas/location';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';
import { getKv, setKv, useKv } from '../db/kv';
import { nextPosition } from './_util';
import { api } from '../api/client';

function activeLocationKey(profileId: string): string {
  return `active_location:${profileId}`;
}

export function useLocations(profileId: string): Location[] {
  const rows = useLiveQuery(() => db.locations.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(
    () => rows.filter((row) => row.deleted_at === null).sort((a, b) => a.position - b.position),
    [rows],
  );
}

export interface SaveLocationInput {
  id?: string;
  profile_id: string;
  name: string;
  emoji: string | null;
  photo_id: string | null;
  chip_goal: number;
  working_for_reward_id?: string | null;
  /** Optional geofence center/radius, groundwork for a later auto-switch feature. */
  lat?: number | null;
  lng?: number | null;
  radius_m?: number | null;
}

export async function saveLocation(input: SaveLocationInput): Promise<string> {
  const existing = input.id ? await db.locations.get(input.id) : undefined;
  const id = input.id ?? newId();
  const position = existing?.position ?? (await nextPosition(db.locations, input.profile_id));
  const row: Location = {
    id,
    profile_id: input.profile_id,
    version: existing?.version ?? 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    name: input.name,
    emoji: input.emoji,
    photo_id: input.photo_id,
    position,
    chip_goal: input.chip_goal,
    working_for_reward_id: input.working_for_reward_id ?? existing?.working_for_reward_id ?? null,
    lat: input.lat ?? existing?.lat ?? null,
    lng: input.lng ?? existing?.lng ?? null,
    radius_m: input.radius_m ?? existing?.radius_m ?? null,
  };
  await upsert('locations', row);
  return id;
}

export async function deleteLocation(id: string): Promise<void> {
  await softDelete('locations', id);
}

export interface UseActiveLocation {
  location: Location | undefined;
  setActiveLocationId: (locationId: string) => void;
}

/** Device kv per profile (CONTRACTS.md), default is the first location by position. */
export function useActiveLocation(profileId: string): UseActiveLocation {
  const locations = useLocations(profileId);
  const activeId = useKv<string | null>(activeLocationKey(profileId), null);
  const location = useMemo(
    () => locations.find((loc) => loc.id === activeId) ?? locations[0],
    [locations, activeId],
  );
  const setActiveLocationId = (locationId: string): void => {
    const previousId = location?.id ?? null;
    void setKv(activeLocationKey(profileId), locationId);
    if (previousId === locationId) return;
    // Best-effort, fire-and-forget: the caregiver-facing part of this
    // (assigning a location, choosing strict/linked) already lives on the
    // server; this just tells it something changed so it can fan a push
    // out. Never awaited, never blocks the location switch on network.
    void api.post(`/profiles/${profileId}/location-changed`, { new_location_id: locationId, old_location_id: previousId }).catch(() => {});
  };
  return { location, setActiveLocationId };
}

/**
 * Non-hook accessor for the ledger-writing side (lib/data/schedule.ts,
 * lib/data/firstThen.ts): the location to credit a chip to when the
 * activity itself has none — the device's remembered choice, else the
 * profile's first location.
 */
export async function getActiveLocationId(profileId: string): Promise<string | null> {
  const stored = await getKv<string | null>(activeLocationKey(profileId));
  if (stored) return stored;
  const locations = await db.locations.where('profile_id').equals(profileId).toArray();
  const first = locations.filter((loc) => loc.deleted_at === null).sort((a, b) => a.position - b.position)[0];
  return first?.id ?? null;
}

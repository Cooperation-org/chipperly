'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Geolocation } from '@capacitor/geolocation';
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from 'leaflet';
import type { Activity } from '@chipperly/shared/schemas/activity';
import type { Location } from '@chipperly/shared/schemas/location';
import { Picture } from '@/components/media/Picture';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Stepper } from '@/components/ui/Stepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSheet } from '@/components/ui/Sheet';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { db } from '@/lib/db/db';
import { restore } from '@/lib/sync/mutate';
import { useActivities, useRoutines, deleteActivity } from '@/lib/data/activities';
import { useRewards, deleteReward } from '@/lib/data/rewards';
import { useLocations, saveLocation, deleteLocation } from '@/lib/data/locations';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { withBase } from '@/lib/api/base';
import styles from './LibraryList.module.css';

import 'leaflet/dist/leaflet.css';

export type LibraryKind = 'activity' | 'reward' | 'location' | 'routine';

export interface LibraryListProps {
  kind: LibraryKind;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function repeatLabel(activity: Activity): string | undefined {
  if (!activity.recurrence) return undefined;
  switch (activity.recurrence) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'weekly': {
      const days = activity.recurrence_weekdays ?? [];
      return days.length > 0 ? `Weekly on ${days.map((d) => WEEKDAY_ABBR[d]).join(', ')}` : 'Weekly';
    }
  }
}

const DEFAULT_RADIUS_M = 100;
const RADIUS_MIN_M = 25;
const RADIUS_MAX_M = 1000;
const RADIUS_STEP_M = 25;
// Contiguous-US center: just a starting map view until a real spot is set
// (via the locate button or a marker drag), never written to state on its own.
const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];

const MARKER_ICON_OPTIONS = {
  iconRetinaUrl: withBase('/leaflet/marker-icon-2x.png'),
  iconUrl: withBase('/leaflet/marker-icon.png'),
  shadowUrl: withBase('/leaflet/marker-shadow.png'),
};

interface LocationMapProps {
  lat: number;
  lng: number;
  radiusM: number;
  onMove: (lat: number, lng: number) => void;
}

/**
 * A Leaflet + OpenStreetMap picker: drag the marker to move the center, the
 * circle shows radiusM. Leaflet touches `window` at import time, which would
 * break Next's static-export prerender (runs in Node), so it's loaded with a
 * dynamic import inside an effect instead of a top-level import.
 */
function LocationMap({ lat, lng, radiusM, onMove }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | undefined>(undefined);
  const markerRef = useRef<LeafletMarker | undefined>(undefined);
  const circleRef = useRef<LeafletCircle | undefined>(undefined);
  const onMoveRef = useRef(onMove);
  const initialRef = useRef({ lat, lng, radiusM });

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      L.Icon.Default.mergeOptions(MARKER_ICON_OPTIONS);
      const { lat: startLat, lng: startLng, radiusM: startRadius } = initialRef.current;
      const map = L.map(containerRef.current, { center: [startLat, startLng], zoom: 15 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
      const circle = L.circle([startLat, startLng], { radius: startRadius, color: '#3a7d5c' }).addTo(map);
      marker.on('drag', () => circle.setLatLng(marker.getLatLng()));
      marker.on('dragend', () => {
        const { lat: nextLat, lng: nextLng } = marker.getLatLng();
        onMoveRef.current(nextLat, nextLng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLatLng([lat, lng]);
    circleRef.current?.setLatLng([lat, lng]);
    mapRef.current?.panTo([lat, lng]);
  }, [lat, lng]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusM);
  }, [radiusM]);

  return <div ref={containerRef} className={styles.map} aria-hidden="true" />;
}

function LocationSheet({ profileId, location }: { profileId: string; location?: Location }) {
  const { close } = useSheet();
  const radiusInputId = useId();
  const [name, setName] = useState(location?.name ?? '');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: location?.emoji, photo_id: location?.photo_id });
  const [goal, setGoal] = useState(location?.chip_goal ?? 5);
  const [lat, setLat] = useState(location?.lat ?? null);
  const [lng, setLng] = useState(location?.lng ?? null);
  const [radiusM, setRadiusM] = useState(location?.radius_m ?? null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function locateCurrentPosition(): Promise<void> {
    setGeoError(undefined);
    setLocating(true);
    try {
      const status = await Geolocation.checkPermissions().catch(() => null);
      if (status?.location === 'denied') throw new Error('denied');
      if (!status || status.location === 'prompt' || status.location === 'prompt-with-rationale') {
        // requestPermissions() isn't implemented on the web plugin — the
        // browser shows its own native prompt from getCurrentPosition()
        // instead — so a failure here is expected on that platform.
        const requested = await Geolocation.requestPermissions().catch(() => null);
        if (requested?.location === 'denied') throw new Error('denied');
      }
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 });
      setLat(position.coords.latitude);
      setLng(position.coords.longitude);
      setRadiusM((current) => current ?? DEFAULT_RADIUS_M);
    } catch (error) {
      setGeoError(
        error instanceof Error && error.message === 'denied'
          ? "Location permission denied. Allow it in your device's settings to set a spot."
          : "Couldn't get your location. Try again.",
      );
    } finally {
      setLocating(false);
    }
  }

  async function submit(): Promise<void> {
    if (!name.trim()) return;
    setSaving(true);
    await saveLocation({
      id: location?.id,
      profile_id: profileId,
      name: name.trim(),
      emoji: picture.emoji ?? null,
      photo_id: picture.photo_id ?? null,
      chip_goal: goal,
      working_for_reward_id: location?.working_for_reward_id,
      lat,
      lng,
      radius_m: radiusM,
    });
    setSaving(false);
    close();
  }

  return (
    <div className={styles.sheet}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <PicturePicker value={picture} onChange={setPicture} name={name || 'Location'} />
      <Stepper label="Chips to earn" value={goal} min={1} max={20} onChange={setGoal} />
      <div className={styles.geo}>
        <span className={styles.geoLabel}>Set this location&rsquo;s spot</span>
        <Button variant="secondary" onClick={() => void locateCurrentPosition()} disabled={locating} loading={locating}>
          Use my current location
        </Button>
        {geoError ? (
          <p className={styles.geoError} role="alert">
            {geoError}
          </p>
        ) : null}
        <LocationMap
          lat={lat ?? DEFAULT_CENTER[0]}
          lng={lng ?? DEFAULT_CENTER[1]}
          radiusM={radiusM ?? DEFAULT_RADIUS_M}
          onMove={(nextLat, nextLng) => {
            setLat(nextLat);
            setLng(nextLng);
          }}
        />
        <Field label={`Radius: ${radiusM ?? DEFAULT_RADIUS_M} m`} htmlFor={radiusInputId}>
          <input
            id={radiusInputId}
            className={styles.radiusInput}
            type="range"
            min={RADIUS_MIN_M}
            max={RADIUS_MAX_M}
            step={RADIUS_STEP_M}
            value={radiusM ?? DEFAULT_RADIUS_M}
            onChange={(e) => setRadiusM(Number(e.target.value))}
          />
        </Field>
      </div>
      <BigButton fullWidth onClick={() => void submit()} disabled={saving}>
        Save
      </BigButton>
    </div>
  );
}

/** S25: activities, rewards and locations, three simple lists sharing one shape. */
export function LibraryList({ kind }: LibraryListProps) {
  const router = useRouter();
  const { open } = useSheet();
  const { profile } = useActiveProfile();
  const profileId = profile?.id;

  const activities = useActivities(profileId ?? '');
  const routines = useRoutines(profileId ?? '');
  const rewards = useRewards(profileId ?? '');
  const locations = useLocations(profileId ?? '');
  const steps = useLiveQuery(() => (profileId ? db.activity_steps.where('profile_id').equals(profileId).toArray() : []), [profileId], []);

  const stepCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const step of steps) {
      if (step.deleted_at !== null) continue;
      counts.set(step.activity_id, (counts.get(step.activity_id) ?? 0) + 1);
    }
    return counts;
  }, [steps]);
  const routineIds = useMemo(() => new Set(routines.map((r) => r.id)), [routines]);
  const plainActivities = useMemo(() => activities.filter((a) => !routineIds.has(a.id)), [activities, routineIds]);

  if (!profileId) return null;
  const pid = profileId;

  function addNew(): void {
    if (kind === 'activity') router.push('/activity/edit/');
    else if (kind === 'routine') router.push('/activity/edit/?routine=1');
    else if (kind === 'reward') router.push('/reward/edit/');
    else open(<LocationSheet profileId={pid} />, { title: 'Add location' });
  }

  const rows =
    kind === 'activity'
      ? plainActivities.map((a) => ({
          id: a.id,
          name: a.name,
          secondary: repeatLabel(a),
          tile: <Picture emoji={a.emoji} photo_id={a.photo_id} name={a.name} size="list" />,
          onTap: () => router.push(`/activity/edit/?id=${a.id}`),
          onDelete: () => {
            void deleteActivity(a.id);
            toast(`Deleted ${a.name}`, { undo: () => void restore('activities', a.id) });
          },
        }))
      : kind === 'routine'
        ? routines.map((a) => ({
            id: a.id,
            name: a.name,
            secondary: `${stepCounts.get(a.id) ?? 0} step${(stepCounts.get(a.id) ?? 0) === 1 ? '' : 's'}`,
            tile: <Picture emoji={a.emoji} photo_id={a.photo_id} name={a.name} size="list" />,
            onTap: () => router.push(`/activity/edit/?id=${a.id}`),
            onDelete: () => {
              void deleteActivity(a.id);
              toast(`Deleted ${a.name}`, { undo: () => void restore('activities', a.id) });
            },
          }))
        : kind === 'reward'
        ? rewards.map((r) => ({
            id: r.id,
            name: r.name,
            secondary: r.always_available ? 'Free time' : r.chip_cost !== null ? `${r.chip_cost} chip${r.chip_cost === 1 ? '' : 's'}` : undefined,
            tile: <Picture emoji={r.emoji} photo_id={r.photo_id} name={r.name} size="list" />,
            onTap: () => router.push(`/reward/edit/?id=${r.id}`),
            onDelete: () => {
              void deleteReward(r.id);
              toast(`Deleted ${r.name}`, { undo: () => void restore('rewards', r.id) });
            },
          }))
        : locations.map((l) => ({
            id: l.id,
            name: l.name,
            secondary: `${l.chip_goal} chips to earn`,
            tile: <Picture emoji={l.emoji} photo_id={l.photo_id} name={l.name} size="list" />,
            onTap: () => open(<LocationSheet profileId={pid} location={l} />, { title: 'Edit location' }),
            onDelete: () => {
              void deleteLocation(l.id);
              toast(`Deleted ${l.name}`, { undo: () => void restore('locations', l.id) });
            },
          }));

  const addLabel =
    kind === 'activity' ? 'Add activity' : kind === 'routine' ? 'Add routine' : kind === 'reward' ? 'Add reward' : 'Add location';
  const emptySentence =
    kind === 'activity'
      ? 'No activities yet.'
      : kind === 'routine'
        ? 'No routines yet.'
        : kind === 'reward'
          ? 'No rewards yet.'
          : 'No locations yet.';

  return (
    <div className={styles.page}>
      <BigButton fullWidth icon="plus" onClick={addNew}>
        {addLabel}
      </BigButton>
      {rows.length === 0 ? (
        <EmptyState sentence={emptySentence} />
      ) : (
        <div className={styles.list}>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              tile={row.tile}
              name={row.name}
              secondary={row.secondary}
              onTap={row.onTap}
              trailing={
                <IconButton
                  icon="trash"
                  aria-label={`Delete ${row.name}`}
                  onClick={row.onDelete}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

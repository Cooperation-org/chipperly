'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Geolocation } from '@capacitor/geolocation';
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from 'leaflet';
import type { Activity } from '@chipperly/shared/schemas/activity';
import { PartOfDay } from '@chipperly/shared/schemas/schedule';
import type { Location } from '@chipperly/shared/schemas/location';
import { Picture } from '@/components/media/Picture';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSheet, Confirm } from '@/components/ui/Sheet';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { db } from '@/lib/db/db';
import { restore, upsert } from '@/lib/sync/mutate';
import { useActivities, useRoutines, deleteActivity } from '@/lib/data/activities';
import { useRewards, deleteReward } from '@/lib/data/rewards';
import { useLocations, saveLocation, deleteLocation } from '@/lib/data/locations';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { withBase } from '@/lib/api/base';
import { effectiveLocationIds, locationFields } from '@/lib/data/locationScope';
import { partOfDayFor } from '@/lib/data/schedule';
import { searchAddress } from './addressSearch';
import { groupRows, mergePlaces, type AddressHit, type PlaceMode } from './places';
import { toggleId, toggleAll, allSelected, pruneSelection } from './selection';
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
  const [goalText, setGoalText] = useState(String(location?.chip_goal ?? 5));
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<AddressHit[] | undefined>();
  const [searchNote, setSearchNote] = useState<string | undefined>();
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

  // Chips to earn: plain number entry. Anything that isn't a whole number >= 1 keeps the place's current goal.
  const typedGoal = Number(goalText);
  const parsedGoal = Number.isInteger(typedGoal) && typedGoal >= 1 ? typedGoal : (location?.chip_goal ?? 5);

  // Runs only on Search / Enter, never per keystroke (Nominatim allows 1 request a second).
  async function runSearch(): Promise<void> {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchNote(undefined);
    setHits(undefined);
    const result = await searchAddress(q);
    setSearching(false);
    if (!result.ok) {
      setSearchNote(
        result.reason === 'guest'
          ? 'Create a free account to use this. For now, use your current location or drag the pin.'
          : result.reason === 'offline'
            ? "You're offline, so address search isn't available. Use your current location or drag the pin instead."
            : "Couldn't search just now. Try again, or use your current location or drag the pin.",
      );
    } else if (result.hits.length === 0) {
      setSearchNote('No match. Try a street and town, or drag the pin.');
    } else {
      setHits(result.hits);
    }
  }

  function applyHit(hit: AddressHit): void {
    setLat(hit.lat);
    setLng(hit.lng);
    setRadiusM((current) => current ?? DEFAULT_RADIUS_M);
    setHits(undefined);
    setSearchNote(undefined);
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
      chip_goal: parsedGoal,
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
      <TextField
        label="Chips to earn"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
      />
      <div className={styles.geo}>
        <span className={styles.geoLabel}>Set this location&rsquo;s spot</span>
        <Button variant="secondary" onClick={() => void locateCurrentPosition()} disabled={locating} loading={locating}>
          Use my current location
        </Button>
        <div
          className={styles.searchRow}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void runSearch();
            }
          }}
        >
          <TextField
            label="Or type an address"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street and town"
            autoComplete="off"
          />
          <Button variant="secondary" onClick={() => void runSearch()} disabled={searching || !query.trim()} loading={searching}>
            Search
          </Button>
        </div>
        {searchNote ? (
          <p className={styles.geoError} role="status">
            {searchNote}
          </p>
        ) : null}
        {hits ? (
          <div className={styles.pickList} role="group" aria-label="Address matches">
            {hits.map((hit) => (
              <Button key={`${hit.lat},${hit.lng},${hit.label}`} variant="secondary" onClick={() => applyHit(hit)}>
                {hit.label}
              </Button>
            ))}
          </div>
        ) : null}
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

type PlaceChoice = { kind: 'every' } | { kind: 'some'; mode: PlaceMode; ids: string[] };

function LocationPick({ locations, count, onPick }: { locations: Location[]; count: number; onPick: (choice: PlaceChoice) => void }) {
  const [mode, setMode] = useState<PlaceMode>('add');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const n = chosen.size;
  const noun = `${n} ${n === 1 ? 'place' : 'places'}`;
  return (
    <div className={styles.pickList}>
      <Segmented
        label="What to do with the places"
        value={mode}
        onChange={(v) => setMode(v === 'replace' ? 'replace' : 'add')}
        items={[
          { value: 'add', label: 'Add to their places' },
          { value: 'replace', label: 'Replace their places' },
        ]}
      />
      <p className={styles.pickNote}>
        {mode === 'add'
          ? `Keeps the places each of the ${count} already has and adds the ones you tick. Ones that show in every place stay that way.`
          : `Throws away the places each of the ${count} has now. They show only in the ones you tick.`}
      </p>
      {locations.map((l) => (
        <div key={l.id} className={styles.pickRow}>
          <span className={styles.pickName}>{l.name}</span>
          <CheckCircle name={l.name} checked={chosen.has(l.id)} onChange={() => setChosen(toggleId(chosen, l.id))} />
        </div>
      ))}
      <BigButton fullWidth disabled={n === 0} onClick={() => onPick({ kind: 'some', mode, ids: [...chosen] })}>
        {n === 0 ? 'Tick at least one place' : mode === 'add' ? `Add ${noun}` : `Replace with ${noun}`}
      </BigButton>
      <hr className={styles.pickRule} />
      <p className={styles.pickNote}>Or skip the ticks and show them in all places, including ones you add later.</p>
      <Button variant="secondary" onClick={() => onPick({ kind: 'every' })}>
        Show in every place
      </Button>
    </div>
  );
}

/** S25: activities, rewards and locations, three simple lists sharing one shape. */
export function LibraryList({ kind }: LibraryListProps) {
  const router = useRouter();
  const { open, close } = useSheet();
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

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkable = kind === 'activity' || kind === 'reward';
  const bulkIds = useMemo(
    () => (kind === 'activity' ? plainActivities.map((a) => a.id) : kind === 'reward' ? rewards.map((r) => r.id) : []),
    [kind, plainActivities, rewards],
  );
  const liveSelected = useMemo(() => pruneSelection(selected, bulkIds), [selected, bulkIds]);

  if (!profileId) return null;
  const pid = profileId;

  function endSelect(): void {
    setSelecting(false);
    setSelected(new Set());
  }

  async function setLocationFor(choice: PlaceChoice): Promise<void> {
    const ids = [...liveSelected];
    const table = kind === 'reward' ? 'rewards' : 'activities';
    interface Prev {
      id: string;
      location_id: string | null;
      location_ids: string[] | null | undefined;
    }
    const previous: Prev[] = [];
    const nextFor = (row: { location_id: string | null; location_ids?: string[] | null }): string[] =>
      choice.kind === 'every' ? [] : mergePlaces(effectiveLocationIds(row), choice.ids, choice.mode);
    for (const id of ids) {
      if (table === 'rewards') {
        const row = await db.rewards.get(id);
        if (!row) continue;
        previous.push({ id, location_id: row.location_id, location_ids: row.location_ids });
        await upsert('rewards', { ...row, ...locationFields(nextFor(row)) });
      } else {
        const row = await db.activities.get(id);
        if (!row) continue;
        previous.push({ id, location_id: row.location_id, location_ids: row.location_ids });
        await upsert('activities', { ...row, ...locationFields(nextFor(row)) });
      }
    }
    const names = choice.kind === 'every' ? [] : choice.ids.map((pid) => locations.find((l) => l.id === pid)?.name ?? 'a place');
    const message =
      choice.kind === 'every'
        ? `${previous.length} now in every place`
        : choice.mode === 'add'
          ? `${previous.length} now also in ${names.join(', ')}`
          : `${previous.length} now only in ${names.join(', ')}`;
    toast(message, {
      undo: () => {
        void (async () => {
          for (const prev of previous) {
            const { id, ...cols } = prev;
            if (table === 'rewards') {
              const row = await db.rewards.get(id);
              if (row) await upsert('rewards', { ...row, ...cols });
            } else {
              const row = await db.activities.get(id);
              if (row) await upsert('activities', { ...row, ...cols });
            }
          }
        })();
      },
    });
    endSelect();
  }

  function pickLocation(): void {
    open(
      <LocationPick
        locations={locations}
        count={liveSelected.size}
        onPick={(choice) => {
          close();
          void setLocationFor(choice);
        }}
      />,
      { title: `Set places for ${liveSelected.size}` },
    );
  }

  function confirmDelete(): void {
    const ids = [...liveSelected];
    const table = kind === 'reward' ? 'rewards' : 'activities';
    open(
      <Confirm
        title={`Delete ${ids.length} ${ids.length === 1 ? 'item' : 'items'}?`}
        body="They disappear from every place. You can undo right after."
        confirmLabel="Delete"
        danger
        onCancel={close}
        onConfirm={() => {
          close();
          for (const id of ids) void (table === 'rewards' ? deleteReward(id) : deleteActivity(id));
          toast(`Deleted ${ids.length}`, { undo: () => ids.forEach((id) => void restore(table, id)) });
          endSelect();
        }}
      />,
      { title: 'Delete selected' },
    );
  }

  function addNew(): void {
    if (kind === 'activity') router.push('/activity/edit/');
    else if (kind === 'routine') router.push('/activity/edit/?routine=1');
    else if (kind === 'reward') router.push('/reward/edit/');
    else open(<LocationSheet profileId={pid} />, { title: 'Add location' });
  }

  const knownPlaceIds = new Set(locations.map((l) => l.id));
  function rewardPlaceKeys(r: { location_id: string | null; location_ids?: string[] | null }): string[] {
    const ids = effectiveLocationIds(r);
    if (ids.length === 0) return ['all'];
    const known = ids.filter((pid) => knownPlaceIds.has(pid));
    return known.length > 0 ? known : ['all'];
  }

  const rows =
    kind === 'activity'
      ? plainActivities.map((a) => ({
          id: a.id,
          name: a.name,
          secondary: repeatLabel(a),
          groupKeys: [partOfDayFor(a.recurrence_time) ?? 'anytime'],
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
            groupKeys: [] as string[],
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
            groupKeys: rewardPlaceKeys(r),
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
            groupKeys: [] as string[],
            secondary: `${l.chip_goal} chips to earn`,
            tile: <Picture emoji={l.emoji} photo_id={l.photo_id} name={l.name} size="list" />,
            onTap: () => open(<LocationSheet profileId={pid} location={l} />, { title: 'Edit location' }),
            onDelete: () => {
              void deleteLocation(l.id);
              toast(`Deleted ${l.name}`, { undo: () => void restore('locations', l.id) });
            },
          }));

  // Activities are day-time based (group by part of day), rewards place based (group by place).
  const grouped = kind === 'activity' || kind === 'reward';
  const groups = grouped
    ? groupRows(rows, (r) => r.groupKeys, kind === 'activity' ? [...PartOfDay.options, 'anytime'] : ['all', ...locations.map((l) => l.id)])
    : [{ key: '', rows }];
  function groupLabel(key: string): string {
    if (kind === 'activity') return key === 'anytime' ? 'Any time of day' : key.charAt(0).toUpperCase() + key.slice(1);
    return key === 'all' ? 'Every place' : (locations.find((l) => l.id === key)?.name ?? 'Other place');
  }

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
      {bulkable && rows.length > 0 ? (
        <div className={styles.bulkBar}>
          {selecting ? (
            <>
              <span className={styles.bulkCount} aria-live="polite">
                {liveSelected.size} selected
              </span>
              <Button variant="secondary" onClick={() => setSelected(toggleAll(liveSelected, bulkIds))}>
                {allSelected(liveSelected, bulkIds) ? 'Select none' : 'Select all'}
              </Button>
              <Button variant="secondary" disabled={liveSelected.size === 0} onClick={pickLocation}>
                Set place
              </Button>
              <Button variant="danger" disabled={liveSelected.size === 0} onClick={confirmDelete}>
                Delete
              </Button>
              <Button variant="ghost" onClick={endSelect}>
                Done
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setSelecting(true)}>
              Select
            </Button>
          )}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState sentence={emptySentence} />
      ) : (
        groups.map((group) => (
          <section key={group.key} className={styles.group}>
            {grouped ? <h2 className={styles.groupHeading}>{groupLabel(group.key)}</h2> : null}
            <div className={styles.list}>
              {group.rows.map((row) => (
                <ListRow
                  key={row.id}
                  tile={row.tile}
                  name={row.name}
                  secondary={row.secondary}
                  onTap={selecting && bulkable ? () => setSelected(toggleId(liveSelected, row.id)) : row.onTap}
                  trailing={
                    selecting && bulkable ? (
                      <CheckCircle
                        name={row.name}
                        checked={liveSelected.has(row.id)}
                        onChange={() => setSelected(toggleId(liveSelected, row.id))}
                      />
                    ) : (
                      <IconButton icon="trash" aria-label={`Delete ${row.name}`} onClick={row.onDelete} />
                    )
                  }
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

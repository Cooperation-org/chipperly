'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity } from '@chipperly/shared/schemas/activity';
import type { Location } from '@chipperly/shared/schemas/location';
import { Picture } from '@/components/media/Picture';
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
import styles from './LibraryList.module.css';

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

function LocationSheet({ profileId, location }: { profileId: string; location?: Location }) {
  const { close } = useSheet();
  const [name, setName] = useState(location?.name ?? '');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: location?.emoji, photo_id: location?.photo_id });
  const [goal, setGoal] = useState(location?.chip_goal ?? 5);
  const [lat, setLat] = useState(location?.lat ?? null);
  const [lng, setLng] = useState(location?.lng ?? null);
  const [radiusM, setRadiusM] = useState(location?.radius_m ?? null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  function useCurrentLocation(): void {
    setGeoError(undefined);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError("This device can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setRadiusM((current) => current ?? DEFAULT_RADIUS_M);
        setLocating(false);
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Allow it in your browser's settings to set a spot."
            : "Couldn't get your location. Try again.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
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
        <Button variant="secondary" onClick={useCurrentLocation} disabled={locating} loading={locating}>
          Use my current location
        </Button>
        {geoError ? (
          <p className={styles.geoError} role="alert">
            {geoError}
          </p>
        ) : null}
        {lat !== null && lng !== null ? (
          <TextField
            label="Radius (meters)"
            type="number"
            inputMode="numeric"
            min={1}
            value={radiusM ?? DEFAULT_RADIUS_M}
            onChange={(e) => {
              const raw = e.target.value;
              setRadiusM(raw === '' ? DEFAULT_RADIUS_M : Math.max(1, Number(raw)));
            }}
          />
        ) : null}
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

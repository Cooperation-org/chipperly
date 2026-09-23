'use client';

import { useEffect, useRef, useState } from 'react';
import type { Device } from '@chipperly/shared/schemas/device';
import { api } from '@/lib/api/client';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { useRouter, useSearchParams } from 'next/navigation';
import { COST_MAX } from '@chipperly/shared/constants/limits';
import { deleteReward, saveReward, useRewards } from '@/lib/data/rewards';
import { setWorkingFor } from '@/lib/data/chips';
import { useLocations } from '@/lib/data/locations';
import { useActiveProfile } from '@/lib/profile/active';
import { restore } from '@/lib/sync/mutate';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Picture } from '@/components/media/Picture';
import { TextField } from '@/components/ui/TextField';
import { Stepper } from '@/components/ui/Stepper';
import { Segmented } from '@/components/ui/Segmented';
import { BigButton } from '@/components/ui/BigButton';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormRow } from './FormRow';
import styles from './RewardForm.module.css';

type FieldKey = 'name' | 'picture' | 'cost' | 'where' | 'screen';

const SCREEN_MINUTES = [0, 15, 30, 60, 120];

function minutesLabel(m: number): string {
  if (m === 0) return 'Off';
  return m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`;
}

/** S19: edit/create reward page. Reads ?id= (edit), and ?location_id=/?working_for=1 to set it working-for after save. */
export function RewardForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get('id');
  const workingForLocationId = searchParams.get('location_id');
  const setAsWorkingFor = searchParams.get('working_for') === '1';
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const locations = useLocations(profileId);

  // No single-reward hook exists; useRewards(profileId) + find keeps this on the fixed lib/data/rewards.ts surface.
  const rewards = useRewards(profileId);
  const reward = editingId ? rewards.find((r) => r.id === editingId) : undefined;

  const [name, setName] = useState('');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: null, photo_id: null });
  const [cost, setCost] = useState(1);
  const [alwaysAvailable, setAlwaysAvailable] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [screenMinutes, setScreenMinutes] = useState(0);
  const [screenPackages, setScreenPackages] = useState<string[]>([]);
  // Every app any of the child's Android devices reports (Settings > Devices), same source as App blocking.
  const [deviceApps, setDeviceApps] = useState<{ package_name: string; app_name: string }[] | null>(null);
  const [openField, setOpenField] = useState<FieldKey | null>(editingId ? null : 'name');
  const [saving, setSaving] = useState(false);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!editingId || seededRef.current || !reward) return;
    seededRef.current = true;
    setName(reward.name);
    setPicture({ emoji: reward.emoji, photo_id: reward.photo_id });
    setCost(reward.chip_cost ?? 1);
    setAlwaysAvailable(reward.always_available);
    setLocationId(reward.location_id);
    setScreenMinutes(reward.screen_time_minutes ?? 0);
    setScreenPackages(reward.screen_time_packages ?? []);
  }, [editingId, reward]);

  useEffect(() => {
    if (openField !== 'screen' || deviceApps !== null) return;
    void api
      .get<{ devices: Device[] }>('/me/devices')
      .then((res) => {
        const seen = new Map<string, string>();
        for (const d of res.devices) for (const a of d.installed_apps ?? []) seen.set(a.package_name, a.app_name);
        setDeviceApps([...seen].map(([package_name, app_name]) => ({ package_name, app_name })).sort((x, y) => x.app_name.localeCompare(y.app_name)));
      })
      .catch(() => setDeviceApps([]));
  }, [openField, deviceApps]);

  function toggleScreenPackage(pkg: string): void {
    setScreenPackages((prev) => (prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg]));
  }

  function toggle(field: FieldKey): void {
    setOpenField((current) => (current === field ? null : field));
  }

  async function onSave(): Promise<void> {
    if (!name.trim() || !profileId || saving) return;
    setSaving(true);
    try {
      const id = await saveReward({
        id: editingId ?? undefined,
        profile_id: profileId,
        name: name.trim(),
        emoji: picture.emoji ?? null,
        photo_id: picture.photo_id ?? null,
        chip_cost: alwaysAvailable ? null : cost,
        location_id: locationId,
        always_available: alwaysAvailable,
        screen_time_minutes: screenMinutes > 0 ? screenMinutes : null,
        screen_time_packages: screenMinutes > 0 ? screenPackages : null,
      });

      if (workingForLocationId && setAsWorkingFor) {
        await setWorkingFor(workingForLocationId, id);
        router.push('/chips/');
        return;
      }
      if (typeof window !== 'undefined' && window.history.length > 1) router.back();
      else router.push('/settings/library/rewards/');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!editingId) return;
    await deleteReward(editingId);
    const deletedId = editingId;
    const deletedName = name;
    toast(`Deleted ${deletedName}`, {
      undo: () => {
        void restore('rewards', deletedId);
      },
    });
    router.push('/settings/library/rewards/');
  }

  const locationItems = [{ value: '', label: 'Everywhere' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];
  const locationLabel = locationId ? (locations.find((l) => l.id === locationId)?.name ?? 'Everywhere') : 'Everywhere';
  const screenSummary =
    screenMinutes === 0
      ? 'Off'
      : `${minutesLabel(screenMinutes)}${screenPackages.length === 0 ? ', no app chosen' : `, ${screenPackages.length} app${screenPackages.length === 1 ? '' : 's'}`}`;
  const costSummary = alwaysAvailable ? 'Always available' : `${cost} chip${cost === 1 ? '' : 's'}`;

  return (
    <div className={styles.page}>
      <PageHeader title={editingId ? 'Edit reward' : 'New reward'} compact />

      <FormRow label="Name" summary={name || 'Required'} open={openField === 'name'} onToggle={() => toggle('name')}>
        <div className={styles.nameField}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
      </FormRow>

      <FormRow
        label="Picture"
        summary={<Picture emoji={picture.emoji} photo_id={picture.photo_id} name={name || 'Reward'} size="list" />}
        open={openField === 'picture'}
        onToggle={() => toggle('picture')}
      >
        <PicturePicker value={picture} onChange={setPicture} name={name || 'Reward'} />
      </FormRow>

      <FormRow label="Cost" summary={costSummary} open={openField === 'cost'} onToggle={() => toggle('cost')}>
        <div className={styles.switchRow}>
          <span>Always available</span>
          <Switch label="Always available" checked={alwaysAvailable} onChange={setAlwaysAvailable} />
        </div>
        {!alwaysAvailable ? <Stepper label="Chip cost" value={cost} min={1} max={COST_MAX} onChange={setCost} /> : null}
      </FormRow>

      <FormRow label="Where" summary={locationLabel} open={openField === 'where'} onToggle={() => toggle('where')}>
        <Segmented label="Where" items={locationItems} value={locationId ?? ''} onChange={(v) => setLocationId(v || null)} />
      </FormRow>

      <FormRow label="Screen time" summary={screenSummary} open={openField === 'screen'} onToggle={() => toggle('screen')}>
        <Segmented
          label="Screen time"
          items={SCREEN_MINUTES.map((m) => ({ value: String(m), label: minutesLabel(m) }))}
          value={String(screenMinutes)}
          onChange={(v) => setScreenMinutes(Number(v))}
        />
        {screenMinutes > 0 ? (
          <>
            <p className={styles.hint}>
              Redeeming this unlocks the apps below for {minutesLabel(screenMinutes)} on the child&rsquo;s Android device, on top
              of any time still left. App blocking locks them again when time is up.
            </p>
            {deviceApps === null ? null : deviceApps.length === 0 ? (
              <p className={styles.hint}>No Android device has reported its apps yet. Open Chipperly on the child&rsquo;s device once, then come back.</p>
            ) : (
              <ul className={styles.appList}>
                {deviceApps.map((app) => (
                  <li key={app.package_name} className={styles.appRow}>
                    <span>{app.app_name}</span>
                    <CheckCircle checked={screenPackages.includes(app.package_name)} onChange={() => toggleScreenPackage(app.package_name)} name={app.app_name} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </FormRow>

      <div className={styles.saveBar}>
        <BigButton variant="primary" fullWidth disabled={!name.trim() || saving} onClick={() => void onSave()}>
          Save
        </BigButton>
      </div>

      {editingId ? (
        <button type="button" className={styles.deleteLink} onClick={() => void onDelete()}>
          Delete reward
        </button>
      ) : null}
    </div>
  );
}

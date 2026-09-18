'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RedeemMode } from '@chipperly/shared/schemas/profile';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Segmented } from '@/components/ui/Segmented';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Switch } from '@/components/ui/Switch';
import { db } from '@/lib/db/db';
import { upsert, softDelete } from '@/lib/sync/mutate';
import { useActiveProfile } from '@/lib/profile/active';
import styles from './ProfileForm.module.css';

export interface ProfileFormProps {
  profileId: string;
}

/** S22: edit or delete a profile. */
export function ProfileForm({ profileId }: ProfileFormProps) {
  const router = useRouter();
  const { open, close } = useSheet();
  const { profiles, setActiveProfileId } = useActiveProfile();
  const row = useLiveQuery(() => db.profiles.get(profileId), [profileId]);

  const [name, setName] = useState('');
  const [picture, setPicture] = useState<PicturePickerValue>({});
  const [redeemMode, setRedeemMode] = useState<RedeemMode>('subtract');
  const [chipsByAttitude, setChipsByAttitude] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the editable fields once per row (react.dev "adjusting state when a
  // prop changes": a guarded setState during render, not an effect, so the
  // form doesn't clobber in-progress edits on every live-query re-render).
  if (row && loadedFor !== row.id) {
    setName(row.name);
    setPicture({ emoji: row.avatar_emoji, photo_id: row.avatar_photo_id });
    setRedeemMode(row.settings.redeem_mode ?? 'subtract');
    setChipsByAttitude(row.settings.chips_by_attitude ?? false);
    setLoadedFor(row.id);
  }

  if (!row) return null;

  async function save(): Promise<void> {
    if (!row || !name.trim()) return;
    setSaving(true);
    await upsert('profiles', {
      ...row,
      name: name.trim(),
      avatar_emoji: picture.emoji ?? null,
      avatar_photo_id: picture.photo_id ?? null,
      settings: { ...row.settings, redeem_mode: redeemMode, chips_by_attitude: chipsByAttitude },
    });
    setSaving(false);
    router.push('/settings/');
  }

  async function confirmDelete(): Promise<void> {
    close();
    await softDelete('profiles', profileId);
    const another = profiles.find((p) => p.id !== profileId);
    if (another) setActiveProfileId(another.id);
    router.push('/settings/profiles/');
  }

  return (
    <div className={styles.form}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <PicturePicker value={picture} onChange={setPicture} name={name || row.name} />
      <div className={styles.setting}>
        <span className={styles.settingLabel}>After a reward</span>
        <Segmented
          label="After a reward"
          items={[
            { value: 'subtract', label: 'Subtract the cost' },
            { value: 'reset', label: 'Start over' },
          ]}
          value={redeemMode}
          onChange={(v) => setRedeemMode(v as RedeemMode)}
        />
      </div>
      <div className={styles.toggleRow}>
        <span className={styles.settingLabel}>Colour chips by attitude</span>
        <Switch label="Colour chips by attitude" checked={chipsByAttitude} onChange={setChipsByAttitude} />
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={() => void save()} loading={saving}>
        Save
      </Button>
      <div className={styles.deleteRow}>
        <Button
          variant="danger"
          fullWidth
          onClick={() =>
            open(
              <Confirm
                title={`Delete ${row.name}'s profile`}
                body="This removes their schedule, chips and rewards. This can't be undone."
                confirmLabel={`Delete ${row.name}'s profile`}
                danger
                onConfirm={() => void confirmDelete()}
                onCancel={close}
              />,
            )
          }
        >
          Delete profile
        </Button>
      </div>
    </div>
  );
}

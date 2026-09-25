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
import { NotificationCheck } from './NotificationCheck';
import { UsesAppSwitch } from './UsesAppSwitch';
import { ReviewReminderSetting } from './ReviewReminderSetting';
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
  const [childPicksReward, setChildPicksReward] = useState(true);
  const [childRedeems, setChildRedeems] = useState(true);
  const [rewardAlerts, setRewardAlerts] = useState(true);
  const [childUsesApp, setChildUsesApp] = useState(true);
  const [childLayout, setChildLayout] = useState<'list' | 'tiles'>('list');
  const [routineBonus, setRoutineBonus] = useState(0);
  const [childReorders, setChildReorders] = useState(false);
  const [pictureMode, setPictureMode] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
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
    setChildPicksReward(row.settings.child_picks_reward ?? true);
    setChildRedeems(row.settings.child_redeems ?? true);
    setRewardAlerts(row.settings.reward_alerts ?? true);
    setChildUsesApp(row.settings.child_uses_app ?? true);
    setChildLayout(row.settings.child_layout ?? 'list');
    setRoutineBonus(row.settings.routine_bonus_chips ?? 0);
    setChildReorders(row.settings.child_reorders ?? false);
    setPictureMode(row.settings.picture_mode ?? false);
    setReadAloud(row.settings.read_aloud ?? false);
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
      settings: {
        ...row.settings,
        redeem_mode: redeemMode,
        chips_by_attitude: chipsByAttitude,
        child_picks_reward: childPicksReward,
        child_redeems: childRedeems,
        reward_alerts: rewardAlerts,
        child_uses_app: childUsesApp,
        child_layout: childLayout,
        routine_bonus_chips: routineBonus || null,
        child_reorders: childReorders,
        picture_mode: pictureMode,
        read_aloud: readAloud,
      },
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
      <UsesAppSwitch name={name || row.name} checked={childUsesApp} onChange={setChildUsesApp} />
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
      {childUsesApp ? (
        <div className={styles.setting}>
          <span className={styles.settingLabel}>Child view</span>
          <Segmented
            label="Child view"
            items={[
              { value: 'list', label: 'Today list' },
              { value: 'tiles', label: 'Picture tiles' },
            ]}
            value={childLayout}
            onChange={(v) => setChildLayout(v as 'list' | 'tiles')}
          />
        </div>
      ) : null}
      <div className={styles.toggleRow}>
        <span className={styles.settingLabel}>Colour chips by attitude</span>
        <Switch label="Colour chips by attitude" checked={chipsByAttitude} onChange={setChipsByAttitude} />
      </div>
      <div className={styles.setting}>
        <span className={styles.settingLabel}>Bonus for a whole routine done in one go, without the steps</span>
        <Segmented
          label="Whole-routine bonus"
          items={[
            { value: '0', label: 'Off' },
            { value: '1', label: '+1' },
            { value: '2', label: '+2' },
            { value: '3', label: '+3' },
            { value: '5', label: '+5' },
          ]}
          value={String(routineBonus)}
          onChange={(v) => setRoutineBonus(Number(v))}
        />
      </div>
      {childUsesApp ? (
        <>
          <div className={styles.toggleRow}>
            <span className={styles.settingLabel}>Child can choose the reward</span>
            <Switch label="Child can choose the reward" checked={childPicksReward} onChange={setChildPicksReward} />
          </div>
          <div className={styles.toggleRow}>
            <span className={styles.settingLabel}>Child can redeem rewards</span>
            <Switch label="Child can redeem rewards" checked={childRedeems} onChange={setChildRedeems} />
          </div>
          <div className={styles.toggleRow}>
            <span className={styles.settingLabel}>Child can change the order of the day</span>
            <Switch label="Child can change the order of the day" checked={childReorders} onChange={setChildReorders} />
          </div>
          <div className={styles.toggleRow}>
            <span className={styles.settingLabel}>Big pictures, fewer words</span>
            <Switch label="Big pictures, fewer words" checked={pictureMode} onChange={setPictureMode} />
          </div>
          <div className={styles.toggleRow}>
            <span className={styles.settingLabel}>Read tasks aloud</span>
            <Switch label="Read tasks aloud" checked={readAloud} onChange={setReadAloud} />
          </div>
          <div className={styles.setting}>
            <div className={styles.toggleRow}>
              <span className={styles.settingLabel}>Alert me when {name || row.name} wants a reward</span>
              <Switch label="Reward alerts" checked={rewardAlerts} onChange={setRewardAlerts} />
            </div>
            {rewardAlerts ? <NotificationCheck /> : null}
          </div>
        </>
      ) : null}
      <ReviewReminderSetting profileId={row.id} name={name || row.name} />
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

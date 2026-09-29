'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { BigButton } from '@/components/ui/BigButton';
import { Segmented } from '@/components/ui/Segmented';
import { useSheet } from '@/components/ui/Sheet';
import { PinPad } from '@/components/pin/PinPad';
import { useSession, setPin } from '@/lib/auth/session';
import { saveLockOptions, useSavedLockOptions, type LockOptions } from '@/lib/device/settings';
import { lockToChild } from '@/lib/device/lock';
import { db } from '@/lib/db/db';
import { upsert } from '@/lib/sync/mutate';
import { toast } from '@/lib/toast';
import styles from './LockSheet.module.css';
import { Switch } from '@/components/ui/Switch';

export interface LockSheetProps {
  profileId: string;
  /**
   * Set when the top bar's lock was tapped with no PIN yet: once the PIN is
   * set, lock straight away (with the saved options) instead of showing them.
   */
  lockAfter?: 'lock' | 'lockPhone';
}

type Step = 'set' | 'confirm' | 'ready';

/**
 * S23: everything about the profile's locked view in one place (Settings >
 * "{name}'s view"), setting a PIN first if none exists yet. What they see and
 * the lock toggles save per device (saveLockOptions); what they can do and the
 * reading aids save on the profile and sync. Saving only saves; the top bar's
 * lock button (or a remote lock) is what locks.
 */
export function LockSheet({ profileId, lockAfter }: LockSheetProps) {
  const router = useRouter();
  const { close } = useSheet();
  const { user, profiles } = useSession();
  const profileName = profiles.find((p) => p.id === profileId)?.name ?? 'this profile';
  const saved = useSavedLockOptions(profileId);
  const row = useLiveQuery(() => db.profiles.get(profileId), [profileId]);

  const [step, setStep] = useState<Step>(user?.pin_hash ? 'ready' : 'set');
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string | undefined>();
  // Edits start from the saved options (loaded async from kv) and only diverge once touched.
  const [edited, setEdited] = useState<LockOptions | null>(null);
  const options = edited ?? saved;
  function setOptions(update: (o: LockOptions) => LockOptions): void {
    setEdited(update(options));
  }

  // The profile-backed rows, seeded once per row (ProfileForm's guarded-setState pattern).
  const [childLayout, setChildLayout] = useState<'list' | 'tiles'>('list');
  const [pictureMode, setPictureMode] = useState(false);
  const [childPicksReward, setChildPicksReward] = useState(true);
  const [childRedeems, setChildRedeems] = useState(true);
  const [childReorders, setChildReorders] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.id) {
    setChildLayout(row.settings.child_layout ?? 'list');
    setPictureMode(row.settings.picture_mode ?? false);
    setChildPicksReward(row.settings.child_picks_reward ?? true);
    setChildRedeems(row.settings.child_redeems ?? true);
    setChildReorders(row.settings.child_reorders ?? false);
    setReadAloud(row.settings.read_aloud ?? false);
    setHighContrast(row.settings.high_contrast ?? false);
    setLoadedFor(row.id);
  }

  const [saving, setSaving] = useState(false);

  async function handleFirstPin(pin: string): Promise<boolean> {
    setFirstPin(pin);
    setPinError(undefined);
    setStep('confirm');
    return true;
  }

  async function handleConfirmPin(pin: string): Promise<boolean> {
    if (pin !== firstPin) {
      setPinError("PINs didn't match, try again");
      setFirstPin('');
      setStep('set');
      return false;
    }
    await setPin(pin);
    setPinError(undefined);
    if (lockAfter) {
      await lockToChild(profileId, { blockApps: lockAfter === 'lockPhone' });
      close();
      router.push('/child/');
      return true;
    }
    setStep('ready');
    return true;
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    await saveLockOptions(profileId, options);
    if (row) {
      await upsert('profiles', {
        ...row,
        settings: {
          ...row.settings,
          child_layout: childLayout,
          picture_mode: pictureMode,
          child_picks_reward: childPicksReward,
          child_redeems: childRedeems,
          child_reorders: childReorders,
          read_aloud: readAloud,
          high_contrast: highContrast,
        },
      });
    }
    setSaving(false);
    close();
    toast(`Saved ${profileName}'s view`);
  }

  if (step !== 'ready') {
    return (
      <div className={styles.sheet}>
        <p className={styles.intro}>
          Set a PIN first. You&apos;ll need it to get back from {profileName}&apos;s view.
        </p>
        <PinPad
          key={step}
          title={step === 'set' ? 'Set a PIN' : 'Enter it again'}
          error={pinError}
          onComplete={step === 'set' ? handleFirstPin : handleConfirmPin}
        />
      </div>
    );
  }

  // The profile-backed rows seed from the dexie row during the first render
  // that has it (the guard above), so nothing renders before it loads.
  if (!row) return null;

  return (
    <div className={styles.sheet}>
      <p className={styles.intro}>
        What {profileName} sees and can do. Lock with the lock button at the top.
      </p>
      <div className={styles.toggles}>
        <p className={styles.sectionTitle}>What {profileName} sees</p>
        <div className={styles.settingRow}>
          <span className={styles.toggleLabel}>Home screen</span>
          <Segmented
            label="Home screen"
            items={[
              { value: 'list', label: 'Today list' },
              { value: 'tiles', label: 'Picture tiles' },
            ]}
            value={childLayout}
            onChange={(v) => setChildLayout(v as 'list' | 'tiles')}
          />
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Only show First-Then, full page</span>
          <Switch
            label="Only show First-Then, full page"
            checked={options.first_then_only}
            onChange={(v) => setOptions((o) => ({ ...o, first_then_only: v }))}
          />
        </div>
        {!options.first_then_only ? (
          <>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show free-time choices</span>
              <Switch label="Show free-time choices" checked={options.show_free_time} onChange={(v) => setOptions((o) => ({ ...o, show_free_time: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show First-Then</span>
              <Switch label="Show First-Then" checked={options.show_first_then} onChange={(v) => setOptions((o) => ({ ...o, show_first_then: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show Chipper Chart</span>
              <Switch label="Show Chipper Chart" checked={options.show_chipper_chart} onChange={(v) => setOptions((o) => ({ ...o, show_chipper_chart: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show steps expanded</span>
              <Switch label="Show steps expanded" checked={options.expand_steps} onChange={(v) => setOptions((o) => ({ ...o, expand_steps: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Ask how it went after each task</span>
              <Switch label="Ask how it went after each task" checked={options.attitude_prompt} onChange={(v) => setOptions((o) => ({ ...o, attitude_prompt: v }))} />
            </div>
          </>
        ) : null}
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Big pictures, fewer words</span>
          <Switch label="Big pictures, fewer words" checked={pictureMode} onChange={setPictureMode} />
        </div>

        <p className={styles.sectionTitle}>What {profileName} can do</p>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{profileName} can choose the reward</span>
          <Switch label={`${profileName} can choose the reward`} checked={childPicksReward} onChange={setChildPicksReward} />
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{profileName} can redeem rewards</span>
          <Switch label={`${profileName} can redeem rewards`} checked={childRedeems} onChange={setChildRedeems} />
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{profileName} can change the order of the day</span>
          <Switch label={`${profileName} can change the order of the day`} checked={childReorders} onChange={setChildReorders} />
        </div>
        {!options.first_then_only ? (
          <>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{profileName} can switch location</span>
              <Switch
                label={`${profileName} can switch location`}
                checked={options.allow_child_location}
                onChange={(v) => setOptions((o) => ({ ...o, allow_child_location: v }))}
              />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{profileName} can start step timers</span>
              <Switch
                label={`${profileName} can start step timers`}
                checked={options.show_step_timers}
                onChange={(v) => setOptions((o) => ({ ...o, show_step_timers: v }))}
              />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{profileName} can open a step list</span>
              <Switch
                label={`${profileName} can open a step list`}
                checked={options.show_visual_schedule}
                onChange={(v) => setOptions((o) => ({ ...o, show_visual_schedule: v }))}
              />
            </div>
          </>
        ) : null}

        <p className={styles.sectionTitle}>Reading and sound</p>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Read tasks aloud</span>
          <Switch label="Read tasks aloud" checked={readAloud} onChange={setReadAloud} />
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>High contrast (CVI)</span>
          <Switch label="High contrast (CVI)" checked={highContrast} onChange={setHighContrast} />
        </div>
      </div>
      <BigButton fullWidth onClick={() => void handleSave()} disabled={saving}>
        Save
      </BigButton>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { Button } from '@/components/ui/Button';
import { firstThenReadiness, FIRST_THEN_SETUP_PATH } from '@/components/firstThen/firstThenReadiness';
import { needsBothConfirm, setExclusive, type ExclusiveKey } from './lockOptionRules';
import { isSelfManaged, settingsCopy } from './settingsCopy';

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
  const { user, profiles, accounts } = useSession();
  const profile = profiles.find((p) => p.id === profileId);
  const profileName = profile?.name ?? 'this profile';
  const copy = settingsCopy(isSelfManaged(accounts.find((a) => a.account.id === profile?.account_id)?.account), profileName);
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
  // Turning on the Chipper Chart or the feelings check while the other is on asks first.
  const [askBoth, setAskBoth] = useState<ExclusiveKey | null>(null);
  const [firstThenNote, setFirstThenNote] = useState('');

  const exclusiveLabel: Record<ExclusiveKey, string> = { show_chipper_chart: 'Chipper Chart', attitude_prompt: 'How do you feel' };

  function toggleExclusive(key: ExclusiveKey, on: boolean): void {
    if (on && needsBothConfirm(options, key)) {
      setAskBoth(key);
      return;
    }
    setAskBoth(null);
    setOptions((o) => setExclusive(o, key, on));
  }

  // First-Then can only be switched on once a First and a Then are picked (firstThenReadiness).
  function toggleFirstThen(key: 'show_first_then' | 'first_then_only', on: boolean): void {
    const readiness = firstThenReadiness(row);
    if (on && !readiness.ready) {
      setFirstThenNote(readiness.message);
      return;
    }
    setFirstThenNote('');
    setOptions((o) => ({ ...o, [key]: on }));
  }

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
    toast(copy.viewSaved);
  }

  if (step !== 'ready') {
    return (
      <div className={styles.sheet}>
        <p className={styles.intro}>
          {copy.pinIntro}
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
        {copy.viewIntro}
      </p>
      <div className={styles.toggles}>
        <p className={styles.sectionTitle}>{copy.seesTitle}</p>
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
            onChange={(v) => toggleFirstThen('first_then_only', v)}
          />
        </div>
        {firstThenNote ? (
          <p className={styles.bothText} role="status">
            {firstThenNote}{' '}
            <Link href={FIRST_THEN_SETUP_PATH} onClick={close} className={styles.noteLink}>
              Set up First-Then
            </Link>
          </p>
        ) : null}
        {!options.first_then_only ? (
          <>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show free-time choices</span>
              <Switch label="Show free-time choices" checked={options.show_free_time} onChange={(v) => setOptions((o) => ({ ...o, show_free_time: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show First-Then</span>
              <Switch label="Show First-Then" checked={options.show_first_then} onChange={(v) => toggleFirstThen('show_first_then', v)} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show Chipper Chart</span>
              <Switch label="Show Chipper Chart" checked={options.show_chipper_chart} onChange={(v) => toggleExclusive('show_chipper_chart', v)} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show steps expanded</span>
              <Switch label="Show steps expanded" checked={options.expand_steps} onChange={(v) => setOptions((o) => ({ ...o, expand_steps: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Ask how it went after each task (How do you feel)</span>
              <Switch label="Ask how it went after each task" checked={options.attitude_prompt} onChange={(v) => toggleExclusive('attitude_prompt', v)} />
            </div>
            {askBoth ? (
              <div className={styles.bothAsk} role="group" aria-label="Show both?">
                <p className={styles.bothText}>
                  The Chipper Chart and How do you feel show two similar things. Most people pick one.
                </p>
                <div className={styles.bothActions}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOptions((o) => setExclusive(o, askBoth, true));
                      setAskBoth(null);
                    }}
                  >
                    Only {exclusiveLabel[askBoth]}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setOptions((o) => setExclusive(o, askBoth, true, true));
                      setAskBoth(null);
                    }}
                  >
                    Show both
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Big pictures, fewer words</span>
          <Switch label="Big pictures, fewer words" checked={pictureMode} onChange={setPictureMode} />
        </div>

        <p className={styles.sectionTitle}>{copy.canTitle}</p>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{copy.can('choose the reward')}</span>
          <Switch label={copy.can('choose the reward')} checked={childPicksReward} onChange={setChildPicksReward} />
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{copy.can('redeem rewards')}</span>
          <Switch label={copy.can('redeem rewards')} checked={childRedeems} onChange={setChildRedeems} />
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{copy.can('change the order of the day')}</span>
          <Switch label={copy.can('change the order of the day')} checked={childReorders} onChange={setChildReorders} />
        </div>
        {!options.first_then_only ? (
          <>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{copy.can('switch location')}</span>
              <Switch
                label={copy.can('switch location')}
                checked={options.allow_child_location}
                onChange={(v) => setOptions((o) => ({ ...o, allow_child_location: v }))}
              />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{copy.can('start step timers')}</span>
              <Switch
                label={copy.can('start step timers')}
                checked={options.show_step_timers}
                onChange={(v) => setOptions((o) => ({ ...o, show_step_timers: v }))}
              />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{copy.can('open a step list')}</span>
              <Switch
                label={copy.can('open a step list')}
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

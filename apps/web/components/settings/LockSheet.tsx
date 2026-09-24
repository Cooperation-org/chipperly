'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BigButton } from '@/components/ui/BigButton';
import { useSheet } from '@/components/ui/Sheet';
import { PinPad } from '@/components/pin/PinPad';
import { useSession, setPin } from '@/lib/auth/session';
import { saveLockOptions, useSavedLockOptions, type LockOptions } from '@/lib/device/settings';
import { lockToChild } from '@/lib/device/lock';
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
 * S23: the child view's options for this profile on this device (Settings >
 * Child view options), setting a PIN first if none exists yet. Saving only
 * saves; the top bar's lock button (or a remote lock) is what locks.
 */
export function LockSheet({ profileId, lockAfter }: LockSheetProps) {
  const router = useRouter();
  const { close } = useSheet();
  const { user, profiles } = useSession();
  const profileName = profiles.find((p) => p.id === profileId)?.name ?? 'this profile';
  const saved = useSavedLockOptions(profileId);

  const [step, setStep] = useState<Step>(user?.pin_hash ? 'ready' : 'set');
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string | undefined>();
  // Edits start from the saved options (loaded async from kv) and only diverge once touched.
  const [edited, setEdited] = useState<LockOptions | null>(null);
  const options = edited ?? saved;
  function setOptions(update: (o: LockOptions) => LockOptions): void {
    setEdited(update(options));
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
    setSaving(false);
    close();
    toast(`Saved ${profileName}'s child view`);
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

  return (
    <div className={styles.sheet}>
      <p className={styles.intro}>
        What {profileName} sees in the child view on this device. Lock with the lock button at the top.
      </p>
      <div className={styles.toggles}>
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
              <span className={styles.toggleLabel}>Ask how it went after each task</span>
              <Switch label="Ask how it went after each task" checked={options.attitude_prompt} onChange={(v) => setOptions((o) => ({ ...o, attitude_prompt: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show steps expanded</span>
              <Switch label="Show steps expanded" checked={options.expand_steps} onChange={(v) => setOptions((o) => ({ ...o, expand_steps: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Show Chipper Chart</span>
              <Switch label="Show Chipper Chart" checked={options.show_chipper_chart} onChange={(v) => setOptions((o) => ({ ...o, show_chipper_chart: v }))} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Let {profileName} switch location</span>
              <Switch
                label={`Let ${profileName} switch location`}
                checked={options.allow_child_location}
                onChange={(v) => setOptions((o) => ({ ...o, allow_child_location: v }))}
              />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Let the child start step timers</span>
              <Switch
                label="Let the child start step timers"
                checked={options.show_step_timers}
                onChange={(v) => setOptions((o) => ({ ...o, show_step_timers: v }))}
              />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Let {profileName} open a step list</span>
              <Switch
                label={`Let ${profileName} open a step list`}
                checked={options.show_visual_schedule}
                onChange={(v) => setOptions((o) => ({ ...o, show_visual_schedule: v }))}
              />
            </div>
          </>
        ) : null}
      </div>
      <BigButton fullWidth onClick={() => void handleSave()} disabled={saving}>
        Save
      </BigButton>
    </div>
  );
}

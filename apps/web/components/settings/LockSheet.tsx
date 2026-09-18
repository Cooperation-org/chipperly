'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BigButton } from '@/components/ui/BigButton';
import { useSheet } from '@/components/ui/Sheet';
import { PinPad } from '@/components/pin/PinPad';
import { useSession, setPin } from '@/lib/auth/session';
import { api } from '@/lib/api/client';
import { lockTo, type LockOptions } from '@/lib/device/settings';
import styles from './LockSheet.module.css';
import { Switch } from '@/components/ui/Switch';

export interface LockSheetProps {
  profileId: string;
}

const DEFAULT_OPTIONS: LockOptions = {
  show_free_time: true,
  show_first_then: true,
  attitude_prompt: false,
  expand_steps: true,
  show_chipper_chart: true,
};

type Step = 'set' | 'confirm' | 'ready';

/** S23: lock this device to a profile's view, setting a PIN first if none exists yet. */
export function LockSheet({ profileId }: LockSheetProps) {
  const router = useRouter();
  const { close } = useSheet();
  const { user, profiles } = useSession();
  const profileName = profiles.find((p) => p.id === profileId)?.name ?? 'this profile';

  const [step, setStep] = useState<Step>(user?.pin_hash ? 'ready' : 'set');
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string | undefined>();
  const [options, setOptions] = useState<LockOptions>(DEFAULT_OPTIONS);
  const [locking, setLocking] = useState(false);

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
    setStep('ready');
    return true;
  }

  async function handleLock(): Promise<void> {
    setLocking(true);
    try {
      // Server-side lock is what sync/push actually enforces (CONTRACTS.md
      // "Sync authorization"); this device's own kv state below is only
      // the local UI's idea of it. Best-effort: an offline caregiver still
      // gets the local child view immediately, same as today.
      await api.post('/me/lock', { profile_id: profileId });
    } catch {
      // ponytail: offline/unreachable, local child view still locks; retry
      // when back online if this matters (Lock this device is caregiver-
      // initiated and rarely offline in practice).
    }
    await lockTo(profileId, options);
    setLocking(false);
    close();
    router.push('/child/');
  }

  if (step !== 'ready') {
    return (
      <div className={styles.sheet}>
        <p className={styles.intro}>
          Lock this device to {profileName}&apos;s view. You&apos;ll need your PIN to get back.
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
        Lock this device to {profileName}&apos;s view. You&apos;ll need your PIN to get back.
      </p>
      <div className={styles.toggles}>
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
      </div>
      <BigButton fullWidth icon="lock" onClick={() => void handleLock()} disabled={locking}>
        Lock
      </BigButton>
    </div>
  );
}

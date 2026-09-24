'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_REVIEW_REMINDER, type ReviewReminder } from '@chipperly/shared/schemas/billing';
import { api } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import styles from './ReviewReminderSetting.module.css';

/** The times most people pick, one tap each; the stepper reaches any hour. */
const QUICK_HOURS = [8, 12, 16, 19, 21];

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
}

type Often = 'off' | '3' | '7' | 'custom';

function oftenOf(days: number): Often {
  return days === 0 ? 'off' : days === 3 ? '3' : days === 7 ? '7' : 'custom';
}

/** "Remind me to check X's routines": this caregiver's own choice for this child, saved straight away (not with the form). */
export function ReviewReminderSetting({ profileId, name }: { profileId: string; name: string }) {
  const [value, setValue] = useState<ReviewReminder | null>(null);
  // Custom stays picked while its stepper passes through 3 or 7.
  const [customPicked, setCustomPicked] = useState(false);

  useEffect(() => {
    void api
      .get<ReviewReminder>(`/profiles/${profileId}/review-reminder`)
      .then(setValue)
      .catch(() => setValue(DEFAULT_REVIEW_REMINDER));
  }, [profileId]);

  async function save(next: ReviewReminder): Promise<void> {
    const before = value;
    setValue(next);
    try {
      await api.put(`/profiles/${profileId}/review-reminder`, next);
    } catch {
      setValue(before);
      toast("Couldn't save the reminder. Check your connection.");
    }
  }

  if (!value) return null;
  const often: Often = customPicked && value.every_days > 0 ? 'custom' : oftenOf(value.every_days);

  function pickOften(next: Often): void {
    if (!value) return;
    setCustomPicked(next === 'custom');
    const days = next === 'off' ? 0 : next === 'custom' ? (value.every_days > 0 ? value.every_days : 5) : Number(next);
    void save({ ...value, every_days: days });
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.title}>Remind me to check {name}&rsquo;s routines</span>
      <Segmented
        label="How often"
        items={[
          { value: '3', label: 'Every 3 days' },
          { value: '7', label: 'Weekly' },
          { value: 'custom', label: 'Custom' },
          { value: 'off', label: 'Off' },
        ]}
        value={often}
        onChange={(v) => pickOften(v as Often)}
      />
      {often === 'custom' ? (
        <div className={styles.row}>
          <span className={styles.label}>Every</span>
          <Stepper
            label="Days between reminders"
            value={value.every_days}
            min={1}
            max={30}
            format={(d) => `${d} day${d === 1 ? '' : 's'}`}
            onChange={(d) => void save({ ...value, every_days: d })}
          />
        </div>
      ) : null}
      {value.every_days > 0 ? (
        <>
          <div className={styles.row}>
            <span className={styles.label}>At</span>
            <Stepper label="Reminder time" value={value.hour} min={0} max={23} format={hourLabel} onChange={(h) => void save({ ...value, hour: h })} />
          </div>
          <div className={styles.chips} role="group" aria-label="Common times">
            {QUICK_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                className={styles.chip}
                aria-pressed={value.hour === h}
                onClick={() => void save({ ...value, hour: h })}
              >
                {hourLabel(h)}
              </button>
            ))}
          </div>
          <p className={styles.hint}>Just for you; others caring for {name} choose their own.</p>
        </>
      ) : null}
    </div>
  );
}

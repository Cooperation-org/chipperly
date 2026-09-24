'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_REVIEW_REMINDER, type ReviewReminder } from '@chipperly/shared/schemas/billing';
import { api } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Segmented } from '@/components/ui/Segmented';
import styles from './ProfileForm.module.css';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
}

/** "Remind me to check X's routines": this caregiver's own choice for this child, saved straight away (not with the form). */
export function ReviewReminderSetting({ profileId, name }: { profileId: string; name: string }) {
  const [value, setValue] = useState<ReviewReminder | null>(null);

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
  return (
    <div className={styles.setting}>
      <span className={styles.settingLabel}>Remind me to check {name}&rsquo;s routines</span>
      <Segmented
        label="Routine reminder"
        items={[
          { value: '3', label: 'Every 3 days' },
          { value: '7', label: 'Weekly' },
          { value: '0', label: 'Off' },
        ]}
        value={String(value.every_days)}
        onChange={(v) => void save({ ...value, every_days: Number(v) as ReviewReminder['every_days'] })}
      />
      {value.every_days > 0 ? (
        <label className={styles.hint}>
          At{' '}
          <select
            aria-label="Reminder time"
            value={value.hour}
            onChange={(e) => void save({ ...value, hour: Number(e.target.value) })}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          . Just for you; others caring for {name} choose their own.
        </label>
      ) : null}
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DayItem } from '@/lib/data/schedule';
import { removeFromDay, setCompleted, setStepCompleted } from '@/lib/data/schedule';
import { upsert, restore } from '@/lib/sync/mutate';
import { setDuration, start } from '@/lib/timer/store';
import { Picture } from '@/components/media/Picture';
import { StepRow } from '@/components/ui/StepRow';
import { Segmented } from '@/components/ui/Segmented';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSheet } from '@/components/ui/Sheet';
import { toast } from '@/lib/toast';
import { formatTime } from './todayModel';
import styles from './ItemSheet.module.css';

export interface ItemSheetProps {
  day: DayItem;
  userId: string;
}

const PART_OF_DAY_ITEMS = [
  { value: 'none', label: 'None' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

/** S7: the item sheet opened by tapping a Today row. */
export function ItemSheet({ day, userId }: ItemSheetProps) {
  const router = useRouter();
  const { close } = useSheet();
  const [removing, setRemoving] = useState(false);
  const item = day.item;

  async function setTime(value: string | null): Promise<void> {
    await upsert('schedule_items', { ...item, start_time: value });
  }

  async function setPartOfDay(value: string): Promise<void> {
    const next = value === 'none' ? null : (value as 'morning' | 'afternoon' | 'evening');
    await upsert('schedule_items', { ...item, part_of_day: next });
  }

  async function onDone(): Promise<void> {
    await setCompleted(item.id, true, userId);
    close();
    toast(`Done: ${day.activity.name}`, {
      undo: () => {
        void setCompleted(item.id, false, userId);
      },
    });
  }

  function startStepTimer(minutes: number): void {
    setDuration(minutes * 60_000);
    start();
    close();
    router.push('/timer/');
  }

  async function onRemove(scope: 'today' | 'always'): Promise<void> {
    await removeFromDay(item.id, scope);
    close();
    toast(`Removed ${day.activity.name}`, {
      undo: () => {
        void restore('schedule_items', item.id);
      },
    });
  }

  return (
    <div className={styles.sheet}>
      <div className={styles.header}>
        <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={day.activity.name} size="grid" />
        <h3 className={styles.name}>{day.activity.name}</h3>
      </div>

      <TimeRow value={item.start_time} onChange={setTime} />

      <Segmented label="Part of day" items={PART_OF_DAY_ITEMS} value={item.part_of_day ?? 'none'} onChange={(v) => void setPartOfDay(v)} />

      {day.steps.length > 0 ? (
        <>
          <p className={styles.routineCaption}>Routine</p>
          <ul className={styles.steps}>
          {day.steps.map((s) => (
            <li key={s.step.id}>
              <StepRow
                tile={<Picture emoji={s.step.emoji} photo_id={s.step.photo_id} name={s.step.name} size="list" />}
                name={s.step.name}
                checked={s.completed_at !== null}
                onChange={(next) => {
                  void setStepCompleted(item.id, s.step.id, next, userId);
                }}
                durationMinutes={s.step.duration_minutes}
                onStartTimer={s.step.duration_minutes ? () => startStepTimer(s.step.duration_minutes as number) : undefined}
              />
            </li>
          ))}
          </ul>
        </>
      ) : null}

      {day.activity.chip_value > 0 ? (
        <p className={styles.chips}>
          Earns {day.activity.chip_value} chip{day.activity.chip_value === 1 ? '' : 's'}
        </p>
      ) : null}

      <div className={styles.actions}>
        <BigButton variant="primary" fullWidth onClick={() => void onDone()}>
          Done
        </BigButton>
        {removing ? (
          <div className={styles.removeChoice}>
            <Button variant="secondary" fullWidth onClick={() => void onRemove('today')}>
              Just today
            </Button>
            <Button variant="secondary" fullWidth onClick={() => void onRemove('always')}>
              Every day
            </Button>
          </div>
        ) : (
          <Button variant="ghost" fullWidth onClick={() => (item.source === 'recurring' ? setRemoving(true) : void onRemove('today'))}>
            Remove from today
          </Button>
        )}
      </div>

      <button
        type="button"
        className={styles.editLink}
        onClick={() => {
          close();
          router.push(`/activity/edit/?id=${day.activity.id}`);
        }}
      >
        Edit activity
      </button>
    </div>
  );
}

function TimeRow({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker(): void {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.focus();
  }

  return (
    <div className={styles.timeRow}>
      <button type="button" className={styles.timeButton} onClick={openPicker}>
        <Icon name="clock" size={20} />
        {value ? formatTime(value) : 'Add time'}
      </button>
      <input
        ref={inputRef}
        type="time"
        className={styles.hiddenInput}
        value={value ?? ''}
        tabIndex={-1}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {value ? (
        <Button variant="ghost" onClick={() => onChange(null)}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

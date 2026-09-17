'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIso, formatDayLabel } from '@chipperly/shared/helpers/date';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAttitudeHistory } from '@/lib/data/attitude';
import { useActiveProfile } from '@/lib/profile/active';
import { db } from '@/lib/db/db';
import styles from './AttitudeHistory.module.css';

const GOOD_EMOJI = '🙂';
const GRUMPY_EMOJI = '😣';

interface DayGroup {
  date: string;
  good: number;
  grumpy: number;
  entries: { id: string; value: 'good' | 'grumpy'; taskName: string }[];
}

/** S29: attitude history by day, read only, for the active profile. */
export function AttitudeHistory() {
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const checks = useAttitudeHistory(profileId);
  const items = useLiveQuery(() => db.schedule_items.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const activities = useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const days = useMemo<DayGroup[]>(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    const activityById = new Map(activities.map((a) => [a.id, a]));
    const byDate = new Map<string, DayGroup>();

    for (const check of checks) {
      const date = todayIso(new Date(check.created_at));
      const item = check.schedule_item_id ? itemById.get(check.schedule_item_id) : undefined;
      const activity = item ? activityById.get(item.activity_id) : undefined;
      const taskName = activity?.name ?? 'General check-in';

      const group = byDate.get(date) ?? { date, good: 0, grumpy: 0, entries: [] };
      if (check.value === 'good') group.good += 1;
      else group.grumpy += 1;
      group.entries.push({ id: check.id, value: check.value, taskName });
      byDate.set(date, group);
    }

    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [checks, items, activities]);

  function toggle(date: string): void {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  if (days.length === 0) {
    return <EmptyState sentence="No check-ins recorded yet." />;
  }

  return (
    <div className={styles.page}>
      {days.map((day) => {
        const isOpen = expanded.has(day.date);
        return (
          <div key={day.date} className={[styles.day, isOpen ? styles.open : ''].filter(Boolean).join(' ')}>
            <button
              type="button"
              className={styles.summary}
              aria-expanded={isOpen}
              onClick={() => toggle(day.date)}
            >
              <span className={styles.date}>{formatDayLabel(day.date)}</span>
              <span className={styles.counts}>
                <span aria-label={`${day.good} good`}>
                  {GOOD_EMOJI} {day.good}
                </span>
                <span aria-label={`${day.grumpy} grumpy`}>
                  {GRUMPY_EMOJI} {day.grumpy}
                </span>
              </span>
              <Icon name="chevron" size={20} className={styles.chevron} />
            </button>
            {isOpen ? (
              <div className={styles.details}>
                {day.entries.map((entry) => (
                  <div key={entry.id} className={styles.detailRow}>
                    <span aria-hidden="true">{entry.value === 'good' ? GOOD_EMOJI : GRUMPY_EMOJI}</span>
                    {entry.taskName}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

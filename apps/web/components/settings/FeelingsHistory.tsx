'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, formatDayLabel, todayIso, weekday } from '@chipperly/shared/helpers/date';
import { EmptyState } from '@/components/ui/EmptyState';
import { faceFor, useFeelingsByDay, type FeelingsDay, type TimelineEntry } from '@/lib/data/feelings';
import { useActiveProfile } from '@/lib/profile/active';
import { db } from '@/lib/db/db';
import styles from './FeelingsHistory.module.css';

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** S29: how the child felt, per task and through the day, with the Chipper Chart taps in the same timeline. */
export function FeelingsHistory() {
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const days = useFeelingsByDay(profileId);
  const items = useLiveQuery(() => db.schedule_items.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const activities = useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const users = useLiveQuery(() => db.users.toArray(), [], []);

  const taskName = useMemo(() => {
    const activityName = new Map(activities.map((a) => [a.id, a.name]));
    return new Map(items.map((i) => [i.id, activityName.get(i.activity_id) ?? 'A task']));
  }, [items, activities]);
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.display_name])), [users]);

  if (days.length === 0) {
    return (
      <EmptyState
        picture={
          <span className={styles.emptyEmoji} aria-hidden="true">
            🙂
          </span>
        }
        sentence="No feelings shared yet. They show here after each task, any time in the day, and at the check-up."
      />
    );
  }

  function describe(entry: TimelineEntry): { emoji: string; title: string; detail: string | null } {
    if (entry.type === 'mood') {
      const { delta, level_after } = entry.event;
      return { emoji: '📈', title: `Chipper Chart ${signed(delta)}`, detail: `Level ${signed(level_after)}` };
    }
    const face = faceFor(entry.feeling);
    const { kind, schedule_item_id, note, created_by } = entry.check;
    const title =
      kind === 'review'
        ? `Team check-up${userName.get(created_by) ? ` by ${userName.get(created_by)}` : ''}`
        : kind === 'checkup'
          ? 'Check-up'
          : schedule_item_id
            ? (taskName.get(schedule_item_id) ?? 'A task')
            : 'Right now';
    return { emoji: face.emoji, title: `${title}: ${face.label}`, detail: note ?? null };
  }

  return (
    <div className={styles.page}>
      <WeekChart days={days} />
      {days.map((day) => (
        <section key={day.date} className={styles.day}>
          <h2 className={styles.dayLabel}>
            {formatDayLabel(day.date)}
            {day.moodLevel !== null ? <span className={styles.dayMood}>Chipper Chart {signed(day.moodLevel)}</span> : null}
          </h2>
          <ol className={styles.timeline}>
            {day.entries.map((entry) => {
              const { emoji, title, detail } = describe(entry);
              const key = entry.type === 'mood' ? entry.event.id : entry.check.id;
              return (
                <li key={key} className={styles.entry}>
                  <span className={styles.time}>{formatTime(entry.at)}</span>
                  <span className={styles.face} aria-hidden="true">
                    {emoji}
                  </span>
                  <span className={styles.text}>
                    <span className={styles.title}>{title}</span>
                    {detail ? <span className={styles.detail}>{detail}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** The last 7 days' average face as bars on one baseline, today on the right. Days with no faces show an empty slot. */
function WeekChart({ days }: { days: readonly FeelingsDay[] }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = todayIso();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>Last 7 days, average feeling</figcaption>
      <div className={styles.bars}>
        {week.map((date) => {
          const average = byDate.get(date)?.average ?? null;
          const face = average === null ? null : faceFor(Math.round(average));
          const label = `${formatDayLabel(date)}: ${face ? `${face.label}, ${average?.toFixed(1)} of 5` : 'no feelings shared'}`;
          return (
            <div key={date} className={styles.barCol} role="img" aria-label={label} title={label}>
              <span className={styles.barFace} aria-hidden="true">
                {face?.emoji ?? ''}
              </span>
              <span className={styles.barTrack}>
                {average !== null ? <span className={styles.bar} style={{ height: `${(average / 5) * 100}%` }} /> : null}
              </span>
              <span className={styles.barDay} aria-hidden="true">
                {WEEKDAY_LETTER[weekday(date)]}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

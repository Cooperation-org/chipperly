'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIso } from '@chipperly/shared/helpers/date';
import { useDayItems, type DayItem } from '@/lib/data/schedule';
import { db } from '@/lib/db/db';
import { Picture } from '@/components/media/Picture';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from './RoutineGoals.module.css';

export interface RoutineGoalsProps {
  profileId: string;
}

/** Pure: today's items worth a goal card — has a goal set already, or has steps (a routine can always get one). */
function withGoalOrSteps(items: readonly DayItem[]): DayItem[] {
  return items.filter((day) => day.activity.goal_text || day.activity.goal_reward_id || day.steps.length > 0);
}

/** Pure: "3 of 5 steps" for a routine; undefined for a plain (stepless) activity. */
function stepProgress(day: DayItem): string | undefined {
  if (day.steps.length === 0) return undefined;
  const done = day.steps.filter((step) => step.completed_at !== null).length;
  return `${done} of ${day.steps.length} step${day.steps.length === 1 ? '' : 's'}`;
}

/** Pure: done is every step complete for a routine, else the item's own completion. */
function isDone(day: DayItem): boolean {
  return day.steps.length > 0 ? day.steps.every((step) => step.completed_at !== null) : day.item.completed_at !== null;
}

/** Chips tab "by routine" view: today's routines and goal-bearing activities, one card each. */
export function RoutineGoals({ profileId }: RoutineGoalsProps) {
  const items = withGoalOrSteps(useDayItems(profileId, todayIso()));

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState
          picture={
            <span className={styles.emptyEmoji} aria-hidden="true">
              🧩
            </span>
          }
          sentence="No routines today."
        />
        <p className={styles.hint}>Add a goal to any routine from its editor.</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {items.map((day) => (
        <RoutineGoalCard key={day.item.id} day={day} />
      ))}
    </div>
  );
}

function RoutineGoalCard({ day }: { day: DayItem }) {
  const router = useRouter();
  const rewardId = day.activity.goal_reward_id;
  const reward = useLiveQuery(() => (rewardId ? db.rewards.get(rewardId) : undefined), [rewardId]);
  const progress = stepProgress(day);
  const done = isDone(day);

  // CheckCircle is its own `role="checkbox"` button, so it sits outside the card's tap
  // target (same "trailing control" split ListRow uses) rather than nested inside one.
  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.cardMain}
        onClick={() => router.push(`/activity/edit/?id=${day.activity.id}`)}
      >
        <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={day.activity.name} size="grid" />
        <div className={styles.cardBody}>
          <span className={styles.name}>{day.activity.name}</span>
          <span className={styles.goalText}>{day.activity.goal_text || 'No goal yet'}</span>
          <span className={styles.rewardRow}>
            {reward ? (
              <>
                <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="list" />
                <span>{reward.name}</span>
              </>
            ) : (
              <span className={styles.muted}>No reward yet</span>
            )}
          </span>
          {progress ? <span className={styles.progress}>{progress}</span> : null}
        </div>
      </button>
      <span className={styles.trailing}>
        <CheckCircle checked={done} name={day.activity.name} disabled />
      </span>
    </div>
  );
}

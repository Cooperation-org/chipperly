'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { todayIso } from '@chipperly/shared/helpers/date';
import { useDayItems } from '@/lib/data/schedule';
import { useLedger, chipsEarnedOn } from '@/lib/data/chips';
import { db } from '@/lib/db/db';
import { Picture } from '@/components/media/Picture';
import { Button } from '@/components/ui/Button';
import { useSheet } from '@/components/ui/Sheet';
import { DayGoalSheet } from './DayGoalSheet';
import styles from './DayGoal.module.css';

export interface DayGoalProps {
  profile: Profile;
}

/** Chips tab "by day" view (owner's doc, My Day 9): the standing daily goal, its reward,
 * chips earned today across every location, and today's completion count. */
export function DayGoal({ profile }: DayGoalProps) {
  const sheet = useSheet();
  const isoDate = todayIso();
  const rewardId = profile.settings.day_goal_reward_id ?? null;
  const reward = useLiveQuery(() => (rewardId ? db.rewards.get(rewardId) : undefined), [rewardId]);
  const ledger = useLedger(profile.id);
  const earned = chipsEarnedOn(ledger, isoDate);
  const items = useDayItems(profile.id, isoDate);
  const doneCount = items.filter((day) => day.item.completed_at !== null).length;

  function openEdit(): void {
    sheet.open(<DayGoalSheet profileId={profile.id} />, { title: 'Day goal' });
  }

  return (
    <div className={styles.card}>
      <span className={styles.goalText}>{profile.settings.day_goal_text || 'Set a goal for the day'}</span>

      <div className={styles.rewardRow}>
        {reward ? (
          <>
            <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="grid" />
            <span className={styles.rewardName}>{reward.name}</span>
          </>
        ) : (
          <span className={styles.muted}>No reward yet</span>
        )}
      </div>

      {profile.settings.day_goal_chips ? (
        <span className={styles.chipLimit}>Up to {profile.settings.day_goal_chips} chips</span>
      ) : null}

      <div className={styles.stats}>
        <span>
          {earned} chip{earned === 1 ? '' : 's'} earned today
        </span>
        <span>
          {doneCount} of {items.length} things done today
        </span>
      </div>

      <Button variant="secondary" onClick={openEdit}>
        Edit day goal
      </Button>
    </div>
  );
}

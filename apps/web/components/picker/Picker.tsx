'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity } from '@chipperly/shared/schemas/activity';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { db } from '@/lib/db/db';
import { useActivities, useRecentActivities } from '@/lib/data/activities';
import { useRewards } from '@/lib/data/rewards';
import { Picture } from '@/components/media/Picture';
import { TextField } from '@/components/ui/TextField';
import { Icon } from '@/components/ui/Icon';
import { filterAndSection } from './pickerModel';
import styles from './Picker.module.css';

export interface PickerProps {
  kind: 'activity' | 'reward';
  profileId: string;
  locationId?: string | null;
  title: string;
  onPick: (item: Activity | Reward) => void;
  onCreateNew: () => void;
}

const RECENT_COUNT = 8;
const SEARCH_THRESHOLD = 12;

/** Sheet content for adding an activity to the day or picking a working-for reward. One component, two data sources. */
export function Picker({ kind, profileId, locationId, onPick, onCreateNew }: PickerProps) {
  const [query, setQuery] = useState('');

  const activities = useActivities(profileId);
  const recentActivities = useRecentActivities(profileId, RECENT_COUNT);
  const rewards = useRewards(profileId, { location_id: locationId });

  const steps = useLiveQuery(() => db.activity_steps.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const stepCountByActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const step of steps) {
      if (step.deleted_at !== null) continue;
      map.set(step.activity_id, (map.get(step.activity_id) ?? 0) + 1);
    }
    return map;
  }, [steps]);

  const itemCount = kind === 'activity' ? activities.length : rewards.length;
  const showSearch = itemCount > SEARCH_THRESHOLD;

  const recent = kind === 'activity' ? filterAndSection(recentActivities, query) : [];
  const filteredActivities = useMemo(
    () => filterAndSection(activities, query).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [activities, query],
  );
  const filteredRewards = useMemo(
    () => filterAndSection(rewards, query).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [rewards, query],
  );

  return (
    <div className={styles.picker}>
      {showSearch ? (
        <TextField
          label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          autoComplete="off"
        />
      ) : null}

      <div className={styles.grid}>
        <button type="button" className={styles.createNew} onClick={onCreateNew} aria-label="Create new">
          <Icon name="plus" size={24} />
          <span>Create new</span>
        </button>
      </div>

      {recent.length > 0 ? (
        <section>
          <h3 className={styles.sectionLabel}>Recent</h3>
          <div className={styles.grid}>
            {recent.map((activity) => (
              <ActivityTile
                key={activity.id}
                activity={activity}
                stepCount={stepCountByActivity.get(activity.id) ?? 0}
                onPick={onPick}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className={styles.sectionLabel}>All</h3>
        <div className={styles.grid}>
          {kind === 'activity'
            ? filteredActivities.map((activity) => (
                <ActivityTile
                  key={activity.id}
                  activity={activity}
                  stepCount={stepCountByActivity.get(activity.id) ?? 0}
                  onPick={onPick}
                />
              ))
            : filteredRewards.map((reward) => <RewardTile key={reward.id} reward={reward} onPick={onPick} />)}
        </div>
      </section>
    </div>
  );
}

interface ActivityTileProps {
  activity: Activity;
  stepCount: number;
  onPick: (item: Activity) => void;
}

function ActivityTile({ activity, stepCount, onPick }: ActivityTileProps) {
  return (
    <button type="button" className={styles.tile} onClick={() => onPick(activity)} aria-label={activity.name}>
      <Picture emoji={activity.emoji} photo_id={activity.photo_id} name={activity.name} size="grid" />
      <span className={styles.tileName} title={activity.name}>
        {activity.name}
      </span>
      {stepCount > 0 ? (
        <span className={styles.badge}>
          {stepCount} step{stepCount === 1 ? '' : 's'}
        </span>
      ) : null}
    </button>
  );
}

interface RewardTileProps {
  reward: Reward;
  onPick: (item: Reward) => void;
}

function RewardTile({ reward, onPick }: RewardTileProps) {
  const costLabel = reward.always_available ? 'Free time' : `${reward.chip_cost ?? 0} chips`;
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={() => onPick(reward)}
      aria-label={`${reward.name}, ${costLabel}`}
    >
      <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="grid" />
      <span className={styles.tileName} title={reward.name}>
        {reward.name}
      </span>
      <span className={styles.badge}>{costLabel}</span>
    </button>
  );
}

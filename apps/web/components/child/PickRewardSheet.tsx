'use client';

import type { Reward } from '@chipperly/shared/schemas/reward';
import { useRewards } from '@/lib/data/rewards';
import { setWorkingFor } from '@/lib/data/chips';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSheet } from '@/components/ui/Sheet';
import styles from './PickRewardSheet.module.css';

export interface PickRewardSheetProps {
  profileId: string;
  locationId: string | null;
  /** The location's current `working_for_reward_id`, marked with a check. */
  currentRewardId: string | null;
}

function hasCost(reward: Reward): reward is Reward & { chip_cost: number } {
  return reward.chip_cost !== null;
}

/** Owner's doc EI 2: the child picks what they're working for, from their own header (S32). */
export function PickRewardSheet({ profileId, locationId, currentRewardId }: PickRewardSheetProps) {
  const sheet = useSheet();
  const rewards = useRewards(profileId, { location_id: locationId, always_available: false }).filter(hasCost);

  async function pick(reward: Reward): Promise<void> {
    if (!locationId) return;
    await setWorkingFor(locationId, reward.id);
    sheet.close();
  }

  if (!locationId || rewards.length === 0) {
    return (
      <EmptyState
        picture={
          <span className={styles.emptyEmoji} aria-hidden="true">
            🎁
          </span>
        }
        sentence="No rewards here yet. Ask a grown-up to add one."
      />
    );
  }

  return (
    <ul className={styles.list}>
      {rewards.map((reward) => {
        const current = reward.id === currentRewardId;
        return (
          <li key={reward.id}>
            <button type="button" className={styles.row} aria-pressed={current} onClick={() => void pick(reward)}>
              <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="list" />
              <span className={styles.text}>
                <span className={styles.name}>{reward.name}</span>
                <span className={styles.cost}>{reward.chip_cost} chips</span>
              </span>
              {current ? <Icon name="check" size={24} className={styles.check} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

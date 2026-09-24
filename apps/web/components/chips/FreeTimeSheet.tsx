'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { useRewards } from '@/lib/data/rewards';
import { addChip, redeem, useBalance } from '@/lib/data/chips';
import { db } from '@/lib/db/db';
import { toast } from '@/lib/toast';
import { sendRewardRequest } from '@/lib/data/rewardRequest';
import { playChip } from '@/lib/sound';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { BigButton } from '@/components/ui/BigButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import styles from './FreeTimeSheet.module.css';

export interface FreeTimeSheetProps {
  profileId: string;
  locationId: string | null;
  canCreate: boolean;
}

function hasCost(reward: Reward): reward is Reward & { chip_cost: number } {
  return reward.chip_cost !== null;
}

/** S11: a choice board (nothing written; picking just highlights a tile), plus the earned rewards the current balance can redeem (owner's doc EI 6). */
export function FreeTimeSheet({ profileId, locationId, canCreate }: FreeTimeSheetProps) {
  const sheet = useSheet();
  const router = useRouter();
  const rewards = useRewards(profileId, { location_id: locationId, always_available: true });
  const earned = useRewards(profileId, { location_id: locationId, always_available: false }).filter(hasCost);
  const balance = useBalance(profileId, locationId);
  const profile = useLiveQuery(() => db.profiles.get(profileId), [profileId]);
  // `canCreate` is only true for the caregiver's own Free time choices
  // (ChipsScreen); the toggle is "Let [name] redeem rewards", so it must not
  // take redeeming away from the caregiver too.
  const canRedeem = canCreate || profile?.settings.child_redeems !== false;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleCreate() {
    sheet.close();
    router.push('/reward/edit/?always=1');
  }

  function handlePick(reward: Reward) {
    setSelectedId(reward.id);
    toast(`Chose ${reward.name}`);
  }

  async function doRedeem(reward: Reward): Promise<void> {
    if (!locationId) return;
    const removed = await redeem(profileId, locationId, reward);
    // canCreate is the caregiver's own sheet; only the child's redeem alerts them.
    if (!canCreate) void sendRewardRequest(profileId, locationId, reward.name, 'free_time');
    playChip();
    toast(`Redeemed ${reward.name}`, {
      // ponytail: restores the balance only; redeem() also clears the
      // location's working-for reward as a side effect and this flow
      // doesn't capture what it was before, so undo leaves that cleared.
      undo: () => void addChip(profileId, locationId, 'adjust', reward.id, removed),
    });
    sheet.back();
  }

  function confirmRedeem(reward: Reward, cost: number): void {
    sheet.open(
      <Confirm
        title="Redeem"
        body={`Redeem ${reward.name} for ${cost} chip${cost === 1 ? '' : 's'}?`}
        confirmLabel="Redeem"
        cancelLabel="Not now"
        onConfirm={() => void doRedeem(reward)}
        onCancel={sheet.back}
      />,
    );
  }

  if (rewards.length === 0 && earned.length === 0) {
    return (
      <EmptyState
        picture={
          <span className={styles.emptyEmoji} aria-hidden="true">
            🎈
          </span>
        }
        sentence="No free-time choices yet"
        actions={canCreate ? [<Button key="add" onClick={handleCreate}>Add one</Button>] : undefined}
      />
    );
  }

  return (
    <div className={styles.sections}>
      {rewards.length > 0 || canCreate ? (
        <div className={styles.grid}>
          {canCreate ? (
            <button type="button" className={styles.createNew} onClick={handleCreate} aria-label="Create new">
              <Icon name="plus" size={24} />
              <span>Create new</span>
            </button>
          ) : null}
          {rewards.map((reward) => (
            <button
              key={reward.id}
              type="button"
              className={[styles.tile, selectedId === reward.id ? styles.selected : ''].filter(Boolean).join(' ')}
              aria-pressed={selectedId === reward.id}
              onClick={() => handlePick(reward)}
            >
              <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="grid" />
              <span className={styles.name}>{reward.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {earned.length > 0 ? (
        <div className={styles.earned}>
          <h3 className={styles.sectionTitle}>Earned rewards</h3>
          <ul className={styles.earnedList}>
            {earned.map((reward) => {
              const cost = reward.chip_cost;
              const affordable = balance >= cost;
              return (
                <li key={reward.id} className={styles.earnedRow}>
                  <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="list" />
                  <span className={styles.earnedText}>
                    <span className={styles.name}>{reward.name}</span>
                    <span className={styles.cost}>{cost} chips</span>
                  </span>
                  {affordable && canRedeem ? (
                    <BigButton onClick={() => confirmRedeem(reward, cost)}>Redeem</BigButton>
                  ) : affordable ? null : (
                    <span className={styles.moreChips}>{cost - balance} more chips</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

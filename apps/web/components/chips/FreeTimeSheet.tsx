'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { useRewards } from '@/lib/data/rewards';
import { toast } from '@/lib/toast';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSheet } from '@/components/ui/Sheet';
import styles from './FreeTimeSheet.module.css';

export interface FreeTimeSheetProps {
  profileId: string;
  locationId: string | null;
  canCreate: boolean;
}

/** S11: a pure choice board. Nothing is written to the ledger; picking just highlights a tile. */
export function FreeTimeSheet({ profileId, locationId, canCreate }: FreeTimeSheetProps) {
  const sheet = useSheet();
  const router = useRouter();
  const rewards = useRewards(profileId, { location_id: locationId, always_available: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleCreate() {
    sheet.close();
    router.push('/reward/edit/?always=1');
  }

  function handlePick(reward: Reward) {
    setSelectedId(reward.id);
    toast(`Chose ${reward.name}`);
  }

  if (rewards.length === 0) {
    return (
      <EmptyState
        sentence="No free-time choices yet"
        actions={canCreate ? [<Button key="add" onClick={handleCreate}>Add one</Button>] : undefined}
      />
    );
  }

  return (
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
  );
}

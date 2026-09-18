'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Location } from '@chipperly/shared/schemas/location';
import { COST_MAX } from '@chipperly/shared/constants/limits';
import { useActiveProfile } from '@/lib/profile/active';
import { useLocations, useActiveLocation, saveLocation } from '@/lib/data/locations';
import { useWorkingFor, setWorkingFor, addChip, redeem, useBalance, useLedger, chipTones } from '@/lib/data/chips';
import { toast } from '@/lib/toast';
import { playChip } from '@/lib/sound';
import { Picture } from '@/components/media/Picture';
import { Picker } from '@/components/picker/Picker';
import { Segmented } from '@/components/ui/Segmented';
import { ChipBoard } from '@/components/ui/ChipBoard';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Celebration } from '@/components/ui/Celebration';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { useSheet } from '@/components/ui/Sheet';
import { FreeTimeSheet } from './FreeTimeSheet';
import styles from './ChipsScreen.module.css';

function GoalStepper({ location, onSave }: { location: Location; onSave: (goal: number) => void }) {
  const [value, setValue] = useState(location.chip_goal);
  return (
    <div className={styles.goalSheet}>
      <Stepper
        label="Chip goal"
        min={1}
        max={COST_MAX}
        value={value}
        onChange={(next) => {
          setValue(next);
          onSave(next);
        }}
      />
    </div>
  );
}

/** S10: location, working-for card, chip board, +/-/Redeem, free time and history links. */
export function ChipsScreen() {
  const router = useRouter();
  const sheet = useSheet();
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const locations = useLocations(profileId);
  const { location, setActiveLocationId } = useActiveLocation(profileId);
  const locationId = location?.id ?? null;
  const balance = useBalance(profileId, locationId);
  const working = useWorkingFor(profileId, locationId);
  const ledger = useLedger(profileId, locationId);
  const tones = profile?.settings.chips_by_attitude ? chipTones(ledger, locationId, working.filled) : undefined;
  const [celebrating, setCelebrating] = useState(false);

  if (!profile) return null;

  const canRedeem = working.reward !== null && working.goal > 0 && working.filled >= working.goal;

  function openRewardPicker() {
    if (!location) return;
    sheet.open(
      <Picker
        kind="reward"
        profileId={profileId}
        locationId={location.id}
        title="Working for..."
        onPick={(item) => {
          void setWorkingFor(location.id, item.id);
          sheet.close();
        }}
        onCreateNew={() => {
          sheet.close();
          router.push(`/reward/edit/?location_id=${location.id}&working_for=1`);
        }}
      />,
      { title: 'Working for...' },
    );
  }

  function openGoalSheet() {
    if (!location) return;
    sheet.open(
      <GoalStepper
        location={location}
        onSave={(goal) => {
          void saveLocation({
            id: location.id,
            profile_id: location.profile_id,
            name: location.name,
            emoji: location.emoji,
            photo_id: location.photo_id,
            chip_goal: goal,
            working_for_reward_id: location.working_for_reward_id,
          });
        }}
      />,
      { title: 'Goal' },
    );
  }

  function openFreeTimeSheet() {
    if (!location) return;
    sheet.open(<FreeTimeSheet profileId={profileId} locationId={location.id} canCreate />, { title: 'Free time' });
  }

  async function handleAddChip() {
    if (!location) return;
    await addChip(profileId, location.id, 'manual', null, 1);
    playChip();
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
  }

  async function handleRemoveChip() {
    if (!location) return;
    await addChip(profileId, location.id, 'manual', null, -1);
  }

  async function handleRedeem() {
    if (!location || !working.reward) return;
    const reward = working.reward;
    // redeem() may remove more than reward.chip_cost (reset mode empties the
    // whole board), so undo compensates with what it actually returns.
    const removed = await redeem(profileId, location.id, reward);
    setCelebrating(true);
    toast(`Redeemed ${reward.name}`, {
      undo: () => {
        void addChip(profileId, location.id, 'adjust', reward.id, removed);
        void setWorkingFor(location.id, reward.id);
      },
    });
  }

  return (
    <div className={styles.screen}>
      {locations.length > 0 ? (
        <Segmented
          label="Location"
          items={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
          value={locationId ?? ''}
          onChange={setActiveLocationId}
        />
      ) : null}

      <button type="button" className={styles.workingFor} onClick={openRewardPicker}>
        <span className={styles.workingForLabel}>Working for</span>
        {working.reward ? (
          <span className={styles.workingForRow}>
            <Picture emoji={working.reward.emoji} photo_id={working.reward.photo_id} name={working.reward.name} size="grid" />
            <span className={styles.workingForText}>
              <span className={styles.workingForName}>{working.reward.name}</span>
              <span className={styles.workingForCount}>
                {working.filled} of {working.goal} chips
              </span>
            </span>
          </span>
        ) : (
          <span className={styles.choose}>Choose a reward</span>
        )}
      </button>

      <div className={styles.boardWrap}>
        <ChipBoard filled={working.filled} total={working.goal} tones={tones} />
        {celebrating ? (
          <div className={styles.celebrationWrap}>
            <Celebration kind="redeem" onDone={() => setCelebrating(false)} />
          </div>
        ) : null}
      </div>

      {!working.reward ? (
        <Button variant="ghost" onClick={openGoalSheet}>
          Goal: {working.goal}
        </Button>
      ) : null}

      <div className={styles.actions}>
        <BigButton variant="primary" onClick={handleRemoveChip} disabled={balance <= 0}>
          <VisuallyHidden>Remove chip</VisuallyHidden>−
        </BigButton>
        {canRedeem && working.reward ? (
          <BigButton variant="accent" onClick={handleRedeem}>
            Redeem {working.reward.emoji ?? '🎁'}
          </BigButton>
        ) : (
          <BigButton variant="primary" onClick={handleAddChip}>
            <VisuallyHidden>Add chip</VisuallyHidden>+
          </BigButton>
        )}
      </div>

      <div className={styles.links}>
        <Button variant="secondary" onClick={openFreeTimeSheet}>
          Free time choices
        </Button>
        <Button variant="secondary" onClick={() => router.push('/chips/history/')}>
          History
        </Button>
      </div>
    </div>
  );
}

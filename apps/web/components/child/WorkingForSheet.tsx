'use client';

import { useBalance, useWorkingFor, setFilled } from '@/lib/data/chips';
import { Picture } from '@/components/media/Picture';
import { PhotoZoom } from '@/components/ui/PhotoZoom';
import { useMediaUrl } from '@/lib/data/media';
import { ChipBoard } from '@/components/ui/ChipBoard';
import { playChip } from '@/lib/sound';
import { sendRewardRequest } from '@/lib/data/rewardRequest';
import styles from './WorkingForSheet.module.css';

export interface WorkingForSheetProps {
  profileId: string;
  locationId: string | null;
}

/**
 * ChildToday's "Chips" sheet (tapped from the header's ChipStrip when
 * child_picks_reward is off): the current reward and a tappable board, same
 * star-rating interaction as the caregiver Chips tab (lib/data/chips.ts's
 * shared setFilled). A named component, not inline JSX, because
 * Sheet.tsx's open() freezes whatever ReactNode it's given as a static
 * snapshot -- inline JSX here would keep showing the fill level from the
 * moment the sheet opened no matter how many chips got tapped afterward.
 * This one runs its own live hooks instead, so it keeps rendering the real
 * state while the sheet stays open.
 */
export function WorkingForSheet({ profileId, locationId }: WorkingForSheetProps) {
  const workingFor = useWorkingFor(profileId, locationId);
  const balance = useBalance(profileId, locationId);
  const rewardPhotoUrl = useMediaUrl(workingFor.reward?.photo_id);

  async function handleSetFilled(next: number): Promise<void> {
    if (!locationId) return;
    const filling = next > balance;
    await setFilled(profileId, locationId, next, balance);
    // Filling the board from here earns the reward just like finishing tasks does.
    const { reward, goal, filled } = workingFor;
    if (reward && filled < goal && next >= goal) void sendRewardRequest(profileId, locationId, reward.name, 'chips');
    if (filling) {
      playChip();
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    }
  }

  return (
    <div className={styles.sheet}>
      {workingFor.reward ? (
        <div className={styles.reward}>
          {rewardPhotoUrl ? (
            <PhotoZoom url={rewardPhotoUrl} name={workingFor.reward.name}>
              <Picture emoji={workingFor.reward.emoji} photo_id={workingFor.reward.photo_id} name={workingFor.reward.name} size="grid" />
            </PhotoZoom>
          ) : (
            <Picture emoji={workingFor.reward.emoji} photo_id={workingFor.reward.photo_id} name={workingFor.reward.name} size="grid" />
          )}
          <span>{workingFor.reward.name}</span>
        </div>
      ) : null}
      <ChipBoard filled={workingFor.filled} total={workingFor.goal} onSetFilled={(next) => void handleSetFilled(next)} />
    </div>
  );
}

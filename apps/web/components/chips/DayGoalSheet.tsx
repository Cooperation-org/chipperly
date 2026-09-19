'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CHIP_MAX } from '@chipperly/shared/constants/limits';
import { db } from '@/lib/db/db';
import { upsert } from '@/lib/sync/mutate';
import { Picture } from '@/components/media/Picture';
import { Picker } from '@/components/picker/Picker';
import { Button } from '@/components/ui/Button';
import { BigButton } from '@/components/ui/BigButton';
import { TextField } from '@/components/ui/TextField';
import { Field } from '@/components/ui/Field';
import { Stepper } from '@/components/ui/Stepper';
import { useSheet } from '@/components/ui/Sheet';
import styles from './DayGoalSheet.module.css';

export interface DayGoalSheetProps {
  profileId: string;
  /** Carries the in-progress edit across a `sheet.replace` round trip through the reward
   * picker (see `openRewardPicker`); omitted on the first open, when the sheet seeds from
   * the profile's saved settings instead. */
  draft?: { goal_text: string; goal_reward_id: string | null; chips: number };
}

/** Caregiver-only: the day's goal, its reward, and an optional chip budget (owner's doc,
 * My Day 9 — "my goal for the day is for Benny to stay on task, and the reward ... is
 * that he gets to pick a reward up to 10 chips"). Saves to profiles.settings. */
export function DayGoalSheet({ profileId, draft }: DayGoalSheetProps) {
  const sheet = useSheet();
  const row = useLiveQuery(() => db.profiles.get(profileId), [profileId]);

  const [goalText, setGoalText] = useState(draft?.goal_text ?? '');
  const [goalRewardId, setGoalRewardId] = useState<string | null>(draft?.goal_reward_id ?? null);
  const [chips, setChips] = useState(draft?.chips ?? 0);
  // Seeds once from the saved row, unless a draft already carries an in-progress edit
  // (the seed-once-per-row pattern from ProfileForm, guarded by `draft` too).
  const [loadedFor, setLoadedFor] = useState<string | null>(draft ? profileId : null);
  const [saving, setSaving] = useState(false);

  const reward = useLiveQuery(() => (goalRewardId ? db.rewards.get(goalRewardId) : undefined), [goalRewardId]);

  if (!draft && row && loadedFor !== row.id) {
    setGoalText(row.settings.day_goal_text ?? '');
    setGoalRewardId(row.settings.day_goal_reward_id ?? null);
    setChips(row.settings.day_goal_chips ?? 0);
    setLoadedFor(row.id);
  }

  if (!row) return null;

  // ponytail: `sheet.replace` swaps this sheet's own content, never pushing a second
  // stack entry (docs/ux-plan.md "one sheet at a time") — the in-progress edit rides
  // along as `draft` since a swap remounts this component and would otherwise drop it.
  function openRewardPicker(): void {
    sheet.replace(
      <Picker
        kind="reward"
        profileId={profileId}
        title="Reward for the day"
        onPick={(item) => {
          sheet.replace(<DayGoalSheet profileId={profileId} draft={{ goal_text: goalText, goal_reward_id: item.id, chips }} />, {
            title: 'Day goal',
          });
        }}
        onCreateNew={() =>
          sheet.replace(<DayGoalSheet profileId={profileId} draft={{ goal_text: goalText, goal_reward_id: goalRewardId, chips }} />, {
            title: 'Day goal',
          })
        }
      />,
      { title: 'Reward for the day' },
    );
  }

  async function save(): Promise<void> {
    if (!row || saving) return;
    setSaving(true);
    await upsert('profiles', {
      ...row,
      settings: {
        ...row.settings,
        day_goal_text: goalText.trim() || null,
        day_goal_reward_id: goalRewardId,
        day_goal_chips: chips > 0 ? chips : null,
      },
    });
    setSaving(false);
    sheet.close();
  }

  return (
    <div className={styles.sheet}>
      <TextField
        label="Goal for the day"
        placeholder="Stay on task"
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
        autoFocus
      />

      <Field label="Reward">
        {reward ? (
          <div className={styles.rewardRow}>
            <button type="button" className={styles.rewardPick} onClick={openRewardPicker}>
              <Picture emoji={reward.emoji} photo_id={reward.photo_id} name={reward.name} size="list" />
              <span>{reward.name}</span>
            </button>
            <Button variant="ghost" onClick={() => setGoalRewardId(null)}>
              Clear
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={openRewardPicker}>
            Choose a reward
          </Button>
        )}
      </Field>

      <Field label="Up to N chips" hint={chips > 0 ? undefined : 'No chip limit set'}>
        <Stepper label="Chip limit for the day" min={0} max={CHIP_MAX} value={chips} onChange={setChips} />
      </Field>

      <BigButton fullWidth onClick={() => void save()} disabled={saving}>
        Save
      </BigButton>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import { db } from '@/lib/db/db';
import {
  useFirstThen,
  useFirstThenProgress,
  setFirst,
  setThen,
  setFirstThenTimer,
  clear,
  completeFirst,
  uncompleteFirst,
} from '@/lib/data/firstThen';
import { useActiveLocation } from '@/lib/data/locations';
import { sendRewardRequest } from '@/lib/data/rewardRequest';
import { playChip } from '@/lib/sound';
import { Picture } from '@/components/media/Picture';
import { Picker } from '@/components/picker/Picker';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { Celebration } from '@/components/ui/Celebration';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { useSheet } from '@/components/ui/Sheet';
import styles from './FirstThenPanels.module.css';

export interface FirstThenPanelsProps {
  profileId: string;
  mode: 'caregiver' | 'child';
  /** Child view: opens the full-screen timer when the child asks for the reward and a timer is set. */
  onStartTimer?: (minutes: number, emoji: string | null, photoId: string | null) => void;
}

const TIMER_CHOICES = [5, 10, 15, 30, 60] as const;

/** S15: two panels, empty until set, never default content (ux-plan.md "must not have"). */
export function FirstThenPanels({ profileId, mode, onStartTimer }: FirstThenPanelsProps) {
  const router = useRouter();
  const sheet = useSheet();
  const { user } = useSession();
  const { first, then } = useFirstThen(profileId);
  const { location } = useActiveLocation(profileId);
  const timerMinutes = useLiveQuery(() => db.profiles.get(profileId), [profileId])?.settings.first_then_timer_minutes ?? null;
  const progress = useFirstThenProgress(profileId, first?.id, then?.id);
  const { done, asked } = progress;
  const [celebrating, setCelebrating] = useState(false);

  const caregiver = mode === 'caregiver';
  const bothSet = Boolean(first && then);

  function openFirstPicker() {
    sheet.open(
      <Picker
        kind="activity"
        profileId={profileId}
        title="First..."
        onPick={(item) => {
          void setFirst(profileId, item.id);
          sheet.close();
        }}
        onCreateNew={() => {
          sheet.close();
          router.push('/activity/edit/');
        }}
      />,
    );
  }

  function openThenPicker() {
    sheet.open(
      <Picker
        kind="reward"
        profileId={profileId}
        title="Then..."
        onPick={(item) => {
          void setThen(profileId, item.id);
          sheet.close();
        }}
        onCreateNew={() => {
          sheet.close();
          router.push('/reward/edit/');
        }}
      />,
    );
  }

  function openMenu() {
    sheet.open(
      <div className={styles.menu}>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            void clear(profileId);
            void progress.set({ done: false });
            sheet.close();
          }}
        >
          Clear both
        </Button>
        <p className={styles.menuLabel}>Timer when the child asks for the reward</p>
        <div className={styles.timerChoices}>
          {[null, ...TIMER_CHOICES].map((minutes) => (
            <Button
              key={minutes ?? 'off'}
              variant={minutes === timerMinutes ? 'primary' : 'secondary'}
              aria-pressed={minutes === timerMinutes}
              onClick={() => {
                void setFirstThenTimer(profileId, minutes);
                sheet.close();
              }}
            >
              {minutes === null ? 'Off' : `${minutes} min`}
            </Button>
          ))}
        </div>
      </div>,
      { title: 'First-Then' },
    );
  }

  async function handleToggleDone(next: boolean) {
    if (!bothSet || !user) return;
    if (next) {
      await progress.set({ done: true });
      const awarded = await completeFirst(profileId, user.id);
      setCelebrating(true);
      if (awarded) playChip();
    } else {
      await progress.set({ done: false });
      await uncompleteFirst(profileId, user.id);
    }
  }

  // The child asking for the reward is what alerts the grown-ups where they are
  // (parents plus that location's care team), once per First-Then; checking
  // FIRST no longer does, so nobody gets two buzzes for one reward.
  async function askForReward(): Promise<void> {
    if (!then || asked) return;
    await progress.set({ done: true, asked: true });
    void sendRewardRequest(profileId, location?.id ?? null, then.name, 'first_then', first?.name);
    if (timerMinutes && onStartTimer) onStartTimer(timerMinutes, then.emoji, then.photo_id);
  }

  const canAsk = !caregiver && done && Boolean(then) && !asked;

  return (
    <div className={styles.wrap}>
      {caregiver ? (
        <div className={styles.toolbar}>
          <IconButton icon="more" aria-label="More" onClick={openMenu} />
        </div>
      ) : null}

      <div className={styles.panels}>
        <div className={[styles.panel, done ? styles.dimmed : ''].filter(Boolean).join(' ')}>
          <span className={styles.label}>First</span>
          {first ? (
            <PanelBody name={first.name} emoji={first.emoji} photoId={first.photo_id} onTap={caregiver ? openFirstPicker : undefined} />
          ) : (
            <EmptyPanel sentence="Choose an activity" onTap={caregiver ? openFirstPicker : undefined} />
          )}
          {bothSet ? <CheckCircle checked={done} onChange={(next) => void handleToggleDone(next)} name="Done" size="lg" /> : null}
        </div>

        <div className={[styles.panel, done ? styles.enlarged : ''].filter(Boolean).join(' ')}>
          <span className={styles.label}>Then</span>
          {then ? (
            <PanelBody
              name={then.name}
              emoji={then.emoji}
              photoId={then.photo_id}
              onTap={caregiver ? openThenPicker : canAsk ? () => void askForReward() : undefined}
              tapLabel={canAsk ? `Ask for ${then.name}` : undefined}
            />
          ) : (
            <EmptyPanel sentence="Choose a reward" onTap={caregiver ? openThenPicker : undefined} />
          )}
          {canAsk ? <span className={styles.hint}>Tap to ask for it</span> : null}
          {!caregiver && asked ? <span className={styles.hint}>Asked. A grown-up is on the way.</span> : null}
        </div>

        {celebrating ? (
          <div className={styles.celebrationWrap}>
            <Celebration kind="first_then" onDone={() => setCelebrating(false)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface PanelBodyProps {
  name: string;
  emoji: string | null;
  photoId: string | null;
  onTap?: () => void;
  tapLabel?: string;
}

function PanelBody({ name, emoji, photoId, onTap, tapLabel }: PanelBodyProps) {
  const content = (
    <>
      <Picture emoji={emoji} photo_id={photoId} name={name} size="child" />
      <span className={styles.name}>{name}</span>
    </>
  );
  if (onTap) {
    return (
      <button type="button" className={styles.tap} onClick={onTap} aria-label={tapLabel}>
        {content}
      </button>
    );
  }
  return <span className={styles.tap}>{content}</span>;
}

function EmptyPanel({ sentence, onTap }: { sentence: string; onTap?: () => void }) {
  if (onTap) {
    return (
      <button type="button" className={styles.empty} onClick={onTap}>
        {sentence}
      </button>
    );
  }
  return <span className={styles.empty}>{sentence}</span>;
}

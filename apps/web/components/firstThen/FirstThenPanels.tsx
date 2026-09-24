'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import { useFirstThen, setFirst, setThen, clear, completeFirst, uncompleteFirst } from '@/lib/data/firstThen';
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
}

/** S15: two panels, empty until set, never default content (ux-plan.md "must not have"). */
export function FirstThenPanels({ profileId, mode }: FirstThenPanelsProps) {
  const router = useRouter();
  const sheet = useSheet();
  const { user } = useSession();
  const { first, then } = useFirstThen(profileId);
  const { location } = useActiveLocation(profileId);
  const [done, setDone] = useState(false);
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
            setDone(false);
            sheet.close();
          }}
        >
          Clear both
        </Button>
      </div>,
      { title: 'First-Then' },
    );
  }

  async function handleToggleDone(next: boolean) {
    if (!bothSet || !user) return;
    if (next) {
      setDone(true);
      if (!caregiver && then) void sendRewardRequest(profileId, location?.id ?? null, then.name, 'first_then');
      const awarded = await completeFirst(profileId, user.id);
      setCelebrating(true);
      if (awarded) playChip();
    } else {
      setDone(false);
      await uncompleteFirst(profileId, user.id);
    }
  }

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
            <PanelBody name={then.name} emoji={then.emoji} photoId={then.photo_id} onTap={caregiver ? openThenPicker : undefined} />
          ) : (
            <EmptyPanel sentence="Choose a reward" onTap={caregiver ? openThenPicker : undefined} />
          )}
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
}

function PanelBody({ name, emoji, photoId, onTap }: PanelBodyProps) {
  const content = (
    <>
      <Picture emoji={emoji} photo_id={photoId} name={name} size="child" />
      <span className={styles.name}>{name}</span>
    </>
  );
  if (onTap) {
    return (
      <button type="button" className={styles.tap} onClick={onTap}>
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

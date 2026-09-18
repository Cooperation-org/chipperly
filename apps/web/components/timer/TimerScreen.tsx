'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveProfile } from '@/lib/profile/active';
import { useTimer, setDuration, start, pause, reset, setReveal, setSound } from '@/lib/timer/store';
import type { TimerReveal } from '@/lib/timer/store';
import { useSheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { BigButton } from '@/components/ui/BigButton';
import { TextField } from '@/components/ui/TextField';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/Switch';
import { Picker } from '@/components/picker/Picker';
import { PicturePicker } from '@/components/picture/PicturePicker';
import type { PicturePickerValue } from '@/components/picture/PicturePicker';
import { TimerRing } from './TimerRing';
import { TimerFullScreen } from './TimerFullScreen';
import { useSquareSize } from './useSquareSize';
import styles from './TimerScreen.module.css';

const PRESET_MINUTES = [1, 2, 5, 10, 15, 30];

function DurationSheetContent({ initialMs, onSet }: { initialMs: number; onSet: (ms: number) => void }) {
  const [minutes, setMinutes] = useState(String(Math.floor(initialMs / 60000)));
  const [seconds, setSeconds] = useState(String(Math.floor((initialMs % 60000) / 1000)).padStart(2, '0'));

  function submit(): void {
    const m = Math.max(0, parseInt(minutes, 10) || 0);
    const s = Math.min(59, Math.max(0, parseInt(seconds, 10) || 0));
    onSet((m * 60 + s) * 1000);
  }

  return (
    <div className={styles.durationSheet}>
      <div className={styles.durationRow}>
        <TextField
          label="Minutes"
          inputMode="numeric"
          pattern="[0-9]*"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
        />
        <TextField
          label="Seconds"
          inputMode="numeric"
          pattern="[0-9]*"
          value={seconds}
          onChange={(e) => setSeconds(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <Button variant="primary" fullWidth onClick={submit}>
        Set
      </Button>
    </div>
  );
}

/** S13's reveal picker: an existing reward's picture, a fresh emoji/photo, or clear. */
function RevealSheetContent({
  profileId,
  current,
  onSet,
  onClear,
}: {
  profileId: string;
  current: TimerReveal | null;
  onSet: (reveal: TimerReveal) => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const sheet = useSheet();
  const pickerValue: PicturePickerValue = { emoji: current?.emoji ?? null, photo_id: current?.photo_id ?? null };

  return (
    <div className={styles.revealSheet}>
      <Picker
        kind="reward"
        profileId={profileId}
        title="Reveal a picture"
        onPick={(item) => {
          onSet({ emoji: item.emoji ?? undefined, photo_id: item.photo_id ?? undefined });
          sheet.close();
        }}
        onCreateNew={() => {
          sheet.close();
          router.push('/reward/edit/');
        }}
      />
      <div className={styles.revealDivider}>
        <span>or choose a picture</span>
      </div>
      <PicturePicker
        value={pickerValue}
        onChange={(v) => {
          onSet({ emoji: v.emoji ?? undefined, photo_id: v.photo_id ?? undefined });
          sheet.close();
        }}
        name="Reveal picture"
      />
      {current ? (
        <Button
          variant="ghost"
          fullWidth
          onClick={() => {
            onClear();
            sheet.close();
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

/** S13: the timer tab. Ring, duration presets, start/pause/reset, reveal picture and end sound. */
export function TimerScreen() {
  const { profile } = useActiveProfile();
  const timer = useTimer();
  const sheet = useSheet();
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [ringBoxRef, ringSize] = useSquareSize(true, 240);

  if (!profile) return null;
  const profileId = profile.id;

  function openDurationSheet(): void {
    sheet.open(
      <DurationSheetContent
        initialMs={timer.total_ms}
        onSet={(ms) => {
          setDuration(ms);
          sheet.close();
        }}
      />,
      { title: 'Set duration' },
    );
  }

  function openRevealSheet(): void {
    sheet.open(
      <RevealSheetContent
        profileId={profileId}
        current={timer.reveal}
        onSet={(reveal) => setReveal(reveal)}
        onClear={() => setReveal(null)}
      />,
    );
  }

  function onRingTap(): void {
    if (timer.running) {
      setFullScreenOpen(true);
    } else {
      openDurationSheet();
    }
  }

  const canStart = timer.total_ms > 0 && timer.remaining_ms > 0;
  const showReset = timer.remaining_ms !== timer.total_ms;

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div ref={ringBoxRef} className={styles.ringBox}>
          <TimerRing remaining_ms={timer.remaining_ms} total_ms={timer.total_ms} reveal={timer.reveal} size={ringSize} onTap={onRingTap} />
        </div>
        <p className={styles.hint}>Tap the time to type a duration</p>

        <div className={styles.presets}>
          {PRESET_MINUTES.map((minutes) => {
            const ms = minutes * 60000;
            const active = timer.total_ms === ms;
            return (
              <Button
                key={minutes}
                variant={active ? 'primary' : 'secondary'}
                icon={active ? 'check' : undefined}
                onClick={() => setDuration(ms)}
              >
                {minutes} min
              </Button>
            );
          })}
        </div>

        <div className={styles.startRow}>
          {timer.running ? (
            <BigButton variant="secondary" icon="pause" fullWidth onClick={pause}>
              Pause
            </BigButton>
          ) : (
            <BigButton variant="primary" icon="play" fullWidth onClick={start} disabled={!canStart}>
              Start
            </BigButton>
          )}
          {showReset ? (
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          ) : null}
        </div>

        <div className={styles.options}>
          <button type="button" className={styles.optionRow} onClick={openRevealSheet}>
            <span className={styles.optionTile}>
              {timer.reveal ? (
                <Picture emoji={timer.reveal.emoji} photo_id={timer.reveal.photo_id} name="Reveal picture" size="list" />
              ) : (
                <span className={styles.optionPlaceholder}>
                  <Icon name="image" size={20} />
                </span>
              )}
            </span>
            <span className={styles.optionLabel}>Reveal a picture</span>
            <Icon name="chevron" size={20} />
          </button>

          <div className={styles.optionRow}>
            <span className={styles.optionLabel}>Sound at the end</span>
            <Switch label="Sound at the end" checked={timer.sound} onChange={setSound} />
          </div>
        </div>
      </div>

      {fullScreenOpen ? <TimerFullScreen onClose={() => setFullScreenOpen(false)} /> : null}
    </div>
  );
}

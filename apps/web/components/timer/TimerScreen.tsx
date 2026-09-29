'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveProfile } from '@/lib/profile/active';
import { useTimer, isEnded, acknowledgeEnd, setDuration, start, pause, reset, setReveal, setSound, setSoundName } from '@/lib/timer/store';
import { TIMER_SOUNDS, previewTimerSound } from '@/lib/sound';
import type { TimerReveal } from '@/lib/timer/store';
import { useSheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { BigButton } from '@/components/ui/BigButton';
import { TextField } from '@/components/ui/TextField';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Switch } from '@/components/ui/Switch';
import { Picker } from '@/components/picker/Picker';
import { PicturePicker } from '@/components/picture/PicturePicker';
import type { PicturePickerValue } from '@/components/picture/PicturePicker';
import { TimerRing } from './TimerRing';
import { TimerTime } from './TimerTime';
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

/** Pick which sound ends the timer; the play button previews it. */
function SoundSheetContent() {
  const current = useTimer().sound_name;
  return (
    <ul className={styles.soundList}>
      {TIMER_SOUNDS.map((s) => (
        <li key={s.id} className={styles.soundRow}>
          <button type="button" className={styles.soundPick} aria-pressed={s.id === current} onClick={() => setSoundName(s.id)}>
            <span className={styles.optionLabel}>{s.label}</span>
            {s.id === current ? <Icon name="check" size={20} /> : null}
          </button>
          <IconButton icon="play" variant="muted" aria-label={`Play ${s.label} sound`} onClick={() => previewTimerSound(s.id)} />
        </li>
      ))}
    </ul>
  );
}

/** S13: the timer tab. Ring, duration presets, start/pause/reset, reveal picture and end sound. */
export function TimerScreen() {
  const { profile } = useActiveProfile();
  const timer = useTimer();
  const sheet = useSheet();
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [ringBoxRef, ringSize] = useSquareSize(timer.reveal !== null, 240);
  const ended = isEnded(timer);

  // Looking at the Timer tab is seeing the end; TimerPill hides here, so
  // without this it would be waiting with a stale 0:00 when you leave.
  useEffect(() => {
    if (ended) acknowledgeEnd();
  }, [ended]);

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

  function openSoundSheet(): void {
    sheet.open(<SoundSheetContent />, { title: 'Sound at the end' });
  }

  function onTimeTap(): void {
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
        {timer.reveal ? (
          <div ref={ringBoxRef} className={styles.ringBox}>
            <TimerRing remaining_ms={timer.remaining_ms} total_ms={timer.total_ms} reveal={timer.reveal} size={ringSize} />
          </div>
        ) : null}
        <TimerTime
          remaining_ms={timer.remaining_ms}
          onEdit={onTimeTap}
          editLabel={timer.running ? 'Open the full screen' : 'Change duration'}
          large={!timer.reveal}
        />
        <p className={styles.hint}>
          {timer.running ? 'Tap the time for the full screen' : 'Tap the time to type a duration'}
        </p>

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

          <button type="button" className={styles.optionRow} onClick={openSoundSheet}>
            <span className={styles.optionLabel}>Choose the sound</span>
            <span className={styles.soundName}>{TIMER_SOUNDS.find((s) => s.id === timer.sound_name)?.label ?? TIMER_SOUNDS[0].label}</span>
            <Icon name="chevron" size={20} />
          </button>
        </div>
      </div>

      {fullScreenOpen ? <TimerFullScreen onClose={() => setFullScreenOpen(false)} /> : null}
    </div>
  );
}

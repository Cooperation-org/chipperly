'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { storeAudio, useMediaUrl } from '@/lib/data/media';
import { setFirstThenAudio, useFirstThenAudio } from '@/lib/data/firstThen';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { playbackReducer } from '@/components/story/playbackState';
import type { Panel } from './panelAudio';
import styles from './PanelVoice.module.css';

/** ponytail: one short sentence is all this is for; 30 seconds. */
const MAX_MS = 30 * 1000;

export interface PanelVoiceProps {
  profileId: string;
  panel: Panel;
  mode: 'caregiver' | 'child';
  /** "First" / "Then" plus the name, for button names. */
  label: string;
}

/**
 * A caregiver's recorded voice for one First-Then panel. Everyone can play it;
 * only the caregiver can record, re-record or delete. `playing` comes from the
 * <audio> element's own events, never from the click.
 */
export function PanelVoice({ profileId, panel, mode, label }: PanelVoiceProps) {
  const audioId = useFirstThenAudio(profileId, panel);
  const url = useMediaUrl(audioId);
  const [playing, dispatch] = useReducer(playbackReducer, false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caregiver = mode === 'caregiver';
  const canRecord =
    caregiver && typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  // Leaving mid-recording stops the microphone.
  useEffect(() => () => recorderRef.current?.stop(), []);

  async function start(): Promise<void> {
    audioRef.current?.pause();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('Chipperly needs the microphone to record. Allow it in your settings, then try again.');
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearTimeout(timerRef.current);
      setRecording(false);
      recorderRef.current = null;
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
      void storeAudio(blob)
        .then((id) => setFirstThenAudio(profileId, panel, id))
        .catch(() => toast("Couldn't save that recording. Try again."));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    timerRef.current = setTimeout(() => recorder.stop(), MAX_MS);
  }

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => dispatch('error'));
  }

  const hasClip = Boolean(audioId && url);
  if (!hasClip && !canRecord) return null;

  if (recording) {
    return (
      <div className={styles.row}>
        <span className={styles.live} role="status">
          Recording...
        </span>
        <Button variant="primary" onClick={() => recorderRef.current?.stop()}>
          Stop
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      {hasClip ? (
        <>
          <button
            type="button"
            className={[styles.play, playing ? styles.playing : ''].filter(Boolean).join(' ')}
            aria-pressed={playing}
            aria-label={`Hear ${label}`}
            onClick={togglePlay}
          >
            {playing ? 'Playing' : 'Listen'}
          </button>
          <audio
            ref={audioRef}
            src={url ?? undefined}
            preload="auto"
            onPlaying={() => dispatch('playing')}
            onPause={() => dispatch('pause')}
            onEnded={() => dispatch('ended')}
            onError={() => dispatch('error')}
            onWaiting={() => dispatch('waiting')}
          />
          {canRecord ? (
            <>
              <Button variant="ghost" onClick={() => void start()} aria-label={`Record ${label} again`}>
                Record again
              </Button>
              <Button variant="ghost" onClick={() => void setFirstThenAudio(profileId, panel, null)} aria-label={`Remove voice for ${label}`}>
                Remove voice
              </Button>
            </>
          ) : null}
        </>
      ) : (
        <Button variant="secondary" onClick={() => void start()} aria-label={`Record your voice for ${label}`}>
          Record your voice
        </Button>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { storeAudio, useMediaUrl } from '@/lib/data/media';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import styles from './VoiceRecorder.module.css';

export interface VoiceRecorderProps {
  /** The page's recording, or null. */
  audioId: string | null;
  onChange: (audioId: string | null) => void;
  /** "page 2", for button names. */
  label: string;
}

/** ponytail: 2 minutes covers a story page read slowly; raise it if someone reads a long page. */
const MAX_MS = 2 * 60 * 1000;

/** Record a story page in your own voice: record, stop, listen, record again or remove. Stored locally first, uploaded with the next sync. */
export function VoiceRecorder({ audioId, onChange, label }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = useMediaUrl(audioId);
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  // Leaving the page mid-recording stops the microphone.
  useEffect(() => () => recorderRef.current?.stop(), []);

  async function start(): Promise<void> {
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
        .then(onChange)
        .catch(() => toast("Couldn't save that recording. Try again."));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    timerRef.current = setTimeout(() => recorder.stop(), MAX_MS);
  }

  function stop(): void {
    recorderRef.current?.stop();
  }

  if (!supported) return null;

  if (recording) {
    return (
      <div className={styles.row}>
        <span className={styles.live} aria-live="polite">
          Recording…
        </span>
        <Button variant="primary" onClick={stop}>
          Stop
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      {audioId && url ? (
        <>
          <audio className={styles.player} src={url} controls preload="none" aria-label={`Your voice for ${label}`} />
          <Button variant="ghost" onClick={() => void start()}>
            Record again
          </Button>
          <Button variant="ghost" onClick={() => onChange(null)}>
            Remove voice
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={() => void start()} aria-label={`Record your voice for ${label}`}>
          Record your voice
        </Button>
      )}
    </div>
  );
}

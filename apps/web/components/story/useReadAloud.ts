'use client';

import { useCallback, useReducer, useRef, type ReactEventHandler } from 'react';
import { speak, stopSpeaking } from '@/lib/speech';
import { playbackReducer } from './playbackState';

/**
 * Read-aloud for a story page, with `playing` driven by real events.
 * Recorded voice: the <audio> element's playing/pause/ended/error/waiting events (spread `audioEvents` on it).
 * Browser/iOS speech: our own utterance's start/end/error events.
 * Android's native TTS reports nothing back through `speak()`, so `playing` stays false there.
 */
export function useReadAloud() {
  const [playing, dispatch] = useReducer(playbackReducer, false);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    utteranceRef.current = null;
    stopSpeaking();
    voiceRef.current?.pause();
    dispatch('stop');
  }, []);

  const say = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      speak(text);
      return;
    }
    if (!text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    // A newer utterance cancels this one; only the current one may switch the state off.
    const ifCurrent = (event: 'ended' | 'error') => () => {
      if (utteranceRef.current === utterance) dispatch(event);
    };
    utterance.onstart = () => {
      if (utteranceRef.current === utterance) dispatch('playing');
    };
    utterance.onend = ifCurrent('ended');
    utterance.onerror = ifCurrent('error');
    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const play = useCallback(
    (text: string, hasRecording: boolean) => {
      const voice = voiceRef.current;
      if (hasRecording && voice) {
        utteranceRef.current = null;
        stopSpeaking();
        voice.currentTime = 0;
        void voice.play().catch(() => say(text));
        return;
      }
      say(text);
    },
    [say],
  );

  const audioEvents: {
    onPlaying: ReactEventHandler<HTMLAudioElement>;
    onPause: ReactEventHandler<HTMLAudioElement>;
    onEnded: ReactEventHandler<HTMLAudioElement>;
    onError: ReactEventHandler<HTMLAudioElement>;
    onWaiting: ReactEventHandler<HTMLAudioElement>;
  } = {
    onPlaying: () => dispatch('playing'),
    onPause: () => dispatch('pause'),
    onEnded: () => dispatch('ended'),
    onError: () => dispatch('error'),
    onWaiting: () => dispatch('waiting'),
  };

  return { playing, play, stop, voiceRef, audioEvents };
}

// Chip earned, timer finished, and the Chipper Chart's up/down taps,
// preloaded once and unlocked on the first user gesture per platform
// autoplay rules (ux-plan.md "Sound"). No 'use client' banner: no hooks
// here, just plain functions safe to import from a client component.
import { getKv } from './db/kv';
import { withBase } from './api/base';

const DEVICE_SETTINGS_KEY = 'device_settings';

let chipAudio: HTMLAudioElement | null = null;
let timerDoneAudio: HTMLAudioElement | null = null;
let chipperUpAudio: HTMLAudioElement | null = null;
let chipperDownAudio: HTMLAudioElement | null = null;
let unlocked = false;

function createAudio(name: string): HTMLAudioElement {
  const audio = new Audio();
  const ext = audio.canPlayType('audio/ogg; codecs="vorbis"') !== '' ? 'ogg' : 'mp3';
  audio.src = withBase(`/sounds/${name}.${ext}`);
  audio.preload = 'auto';
  return audio;
}

function unlockOnce(): void {
  if (unlocked) return;
  unlocked = true;
  for (const audio of [chipAudio, timerDoneAudio, chipperUpAudio, chipperDownAudio]) {
    if (!audio) continue;
    // A play-then-pause on the first real gesture satisfies the mobile
    // autoplay policy for every later programmatic play() call.
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {});
  }
}

function init(): void {
  if (typeof window === 'undefined' || chipAudio) return;
  chipAudio = createAudio('chip');
  timerDoneAudio = createAudio('timer-done');
  chipperUpAudio = createAudio('chipper-up');
  chipperDownAudio = createAudio('chipper-down');
  document.addEventListener('pointerdown', unlockOnce, { once: true });
}

if (typeof window !== 'undefined') init();

async function soundsEnabled(): Promise<boolean> {
  const settings = await getKv<{ sounds?: boolean }>(DEVICE_SETTINGS_KEY);
  return settings?.sounds ?? true;
}

async function play(audio: HTMLAudioElement | null): Promise<void> {
  if (!audio) return;
  if (!(await soundsEnabled())) return;
  audio.currentTime = 0;
  await audio.play().catch(() => {});
}

export function playChip(): void {
  void play(chipAudio);
}

export function playTimerDone(): void {
  void play(timerDoneAudio);
}

/** Chipper Chart level goes up. */
export function playChipperUp(): void {
  void play(chipperUpAudio);
}

/** Chipper Chart level goes down. */
export function playChipperDown(): void {
  void play(chipperDownAudio);
}

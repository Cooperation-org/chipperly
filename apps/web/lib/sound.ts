// Chip earned, timer finished, and the Chipper Chart's up/down taps,
// preloaded once and unlocked on the first user gesture per platform
// autoplay rules (ux-plan.md "Sound"). No 'use client' banner: no hooks
// here, just plain functions safe to import from a client component.
import { personSoundsOn } from './personSounds';
import { getKv } from './db/kv';
import { withBase } from './api/base';

const DEVICE_SETTINGS_KEY = 'device_settings';

let chipAudio: HTMLAudioElement | null = null;
let timerDoneAudio: HTMLAudioElement | null = null;
let chipperUpAudio: HTMLAudioElement | null = null;
let chipperDownAudio: HTMLAudioElement | null = null;
let unlocked = false;

/** Sounds the timer can end with: every file in public/sounds/. `id` is the file name without extension. */
export const TIMER_SOUNDS = [
  { id: 'timer-done', label: 'Chime' },
  { id: 'chip', label: 'Chip' },
  { id: 'chipper-up', label: 'Rising' },
  { id: 'chipper-down', label: 'Falling' },
] as const;
export const DEFAULT_TIMER_SOUND = 'timer-done';

const namedAudio = new Map<string, HTMLAudioElement>();
function audioFor(name: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  let audio = namedAudio.get(name);
  if (!audio) {
    audio = createAudio(name);
    namedAudio.set(name, audio);
  }
  return audio;
}

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
  for (const audio of [chipAudio, timerDoneAudio, chipperUpAudio, chipperDownAudio, ...namedAudio.values()]) {
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
  if (!personSoundsOn() || !(await soundsEnabled())) return;
  audio.currentTime = 0;
  await audio.play().catch(() => {});
}

export function playChip(): void {
  void play(chipAudio);
}

export function playTimerDone(name: string = DEFAULT_TIMER_SOUND): void {
  void play(name === DEFAULT_TIMER_SOUND ? timerDoneAudio : audioFor(name));
}

/** Preview button next to each timer sound choice. */
export function previewTimerSound(name: string): void {
  playTimerDone(name);
}

/** Chipper Chart level goes up. */
export function playChipperUp(): void {
  void play(chipperUpAudio);
}

/** Chipper Chart level goes down. */
export function playChipperDown(): void {
  void play(chipperDownAudio);
}

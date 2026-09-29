'use client';

// Module singleton + useSyncExternalStore (CONTRACTS.md), so the timer
// survives route changes. Ticks with requestAnimationFrame while running,
// always computing `remaining_ms` from `started_at` (never a tick count),
// and persists to kv so a reload keeps it going.
import { useSyncExternalStore } from 'react';
import { getKv, setKv } from '../db/kv';
import { DEFAULT_TIMER_SOUND, playTimerDone } from '../sound';

const KV_KEY = 'timer_state';

export interface TimerReveal {
  emoji?: string;
  photo_id?: string;
}

export interface TimerState {
  remaining_ms: number;
  total_ms: number;
  running: boolean;
  started_at: number | null;
  reveal: TimerReveal | null;
  sound: boolean;
  /** Which file in public/sounds/ plays at the end (see TIMER_SOUNDS in lib/sound.ts). */
  sound_name: string;
  ended_at: number | null;
  /** True only for a child's step timer started while the device is locked: pausing/stopping needs the caregiver PIN, and the OS-level kiosk lock stays engaged for as long as this is true. */
  locked: boolean;
}

const DEFAULT_STATE: TimerState = {
  remaining_ms: 0,
  total_ms: 0,
  running: false,
  started_at: null,
  reveal: null,
  sound: true,
  sound_name: DEFAULT_TIMER_SOUND,
  ended_at: null,
  locked: false,
};

let state: TimerState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();
let rafHandle: number | null = null;
let hydrated = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  void setKv(KV_KEY, state);
}

function setState(patch: Partial<TimerState>): void {
  state = { ...state, ...patch };
  notify();
  persist();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TimerState {
  return state;
}

function computeRemaining(): number {
  if (state.started_at === null) return state.remaining_ms;
  return Math.max(0, state.total_ms - (Date.now() - state.started_at));
}

function tick(): void {
  if (!state.running) {
    rafHandle = null;
    return;
  }
  const remaining = computeRemaining();
  if (remaining <= 0) {
    const shouldPlay = state.sound;
    const soundName = state.sound_name;
    state = { ...state, remaining_ms: 0, running: false, started_at: null, ended_at: Date.now() };
    notify();
    persist();
    if (shouldPlay) playTimerDone(soundName);
    rafHandle = null;
    return;
  }
  state = { ...state, remaining_ms: remaining };
  notify();
  rafHandle = requestAnimationFrame(tick);
}

function ensureTicking(): void {
  if (rafHandle === null && state.running && typeof requestAnimationFrame !== 'undefined') {
    rafHandle = requestAnimationFrame(tick);
  }
}

/**
 * State to resume from a saved snapshot. A timer that ran out while the app
 * was closed (or was left on its "Time's up" screen) comes back idle at its
 * full duration: the end alert already had its moment, so a reload must not
 * re-arm it.
 */
export function restoreState(saved: TimerState, now: number): TimerState {
  const next: TimerState = { ...DEFAULT_STATE, ...saved };
  if (next.running && next.started_at !== null) {
    const remaining = Math.max(0, next.total_ms - (now - next.started_at));
    if (remaining > 0) return { ...next, remaining_ms: remaining };
    return { ...next, remaining_ms: next.total_ms, running: false, started_at: null, ended_at: null, locked: false };
  }
  if (isEnded(next)) return { ...next, remaining_ms: next.total_ms, ended_at: null, locked: false };
  return next;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const saved = await getKv<TimerState>(KV_KEY);
  if (!saved) return;

  const next = restoreState(saved, Date.now());
  state = next;
  notify();
  if (state.running) ensureTicking();
}

if (typeof window !== 'undefined') void hydrate();

/** The one condition every "Time's up" surface (pill, full screen) keys off. */
export function isEnded(s: Pick<TimerState, 'ended_at' | 'remaining_ms'>): boolean {
  return s.ended_at !== null && s.remaining_ms === 0;
}

/** The end alert has been seen: back to idle at the full duration. */
export function acknowledgeEnd(): void {
  if (isEnded(state)) reset();
}

export function useTimer(): TimerState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Same value useTimer() would give a component; a plain function for tests, which can't call hooks. */
export function getTimerSnapshot(): TimerState {
  return getSnapshot();
}

function getRunningSnapshot(): boolean {
  return state.running;
}

/** Like `useTimer`, but only re-renders when `running` flips — not on every tick's `remaining_ms`. */
export function useTimerRunning(): boolean {
  return useSyncExternalStore(subscribe, getRunningSnapshot, getRunningSnapshot);
}

export function setDuration(totalMs: number): void {
  setState({ total_ms: totalMs, remaining_ms: totalMs, running: false, started_at: null, ended_at: null });
}

export function start(): void {
  if (state.total_ms <= 0 || state.remaining_ms <= 0) return;
  const started_at = Date.now() - (state.total_ms - state.remaining_ms);
  setState({ running: true, started_at, ended_at: null });
  ensureTicking();
}

export function pause(): void {
  if (!state.running) return;
  setState({ running: false, remaining_ms: computeRemaining(), started_at: null });
}

export function reset(): void {
  setState({ remaining_ms: state.total_ms, running: false, started_at: null, ended_at: null, locked: false });
}

export function setLocked(locked: boolean): void {
  setState({ locked });
}

export function setReveal(reveal: TimerReveal | null): void {
  setState({ reveal });
}

export function setSoundName(sound_name: string): void {
  setState({ sound_name });
}

/** S13's own "Sound at the end" toggle, separate from the device-wide sounds setting (lib/device/settings.ts). */
export function setSound(sound: boolean): void {
  setState({ sound });
}

'use client';

import { useEffect, useState } from 'react';
import { getKv, setKv, useKv, useKvLoaded } from '../db/kv';

export interface DeviceSettings {
  sounds: boolean;
  reduce_motion: 'system' | 'on' | 'off';
  high_contrast: boolean;
}

const DEVICE_SETTINGS_KEY = 'device_settings';
const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { sounds: true, reduce_motion: 'system', high_contrast: false };

export function useDeviceSettings(): DeviceSettings {
  return useKv<DeviceSettings>(DEVICE_SETTINGS_KEY, DEFAULT_DEVICE_SETTINGS);
}

export async function setDeviceSettings(patch: Partial<DeviceSettings>): Promise<void> {
  const current = (await getKv<DeviceSettings>(DEVICE_SETTINGS_KEY)) ?? DEFAULT_DEVICE_SETTINGS;
  await setKv<DeviceSettings>(DEVICE_SETTINGS_KEY, { ...current, ...patch });
}

export interface LockOptions {
  show_free_time: boolean;
  show_first_then: boolean;
  attitude_prompt: boolean;
  expand_steps: boolean;
  show_chipper_chart: boolean;
  /** SOW Q3, decided: off by default; on lets the child switch location from their own header. */
  allow_child_location: boolean;
  /** SOW Q6, decided: off by default; on lets the child start a timed step's timer themselves. */
  show_step_timers: boolean;
  /** On by default; on lets the child open a routine's steps as a full-screen visual schedule (S32, S36). */
  show_visual_schedule: boolean;
  /** Off by default; on replaces the whole locked view with just First-Then, full-page -- no task list, no other options underneath. */
  first_then_only: boolean;
}

export interface LockState {
  locked_profile_id: string | null;
  options: LockOptions;
}

const LOCK_KEY = 'lock';
export const DEFAULT_LOCK_OPTIONS: LockOptions = {
  show_free_time: true,
  show_first_then: true,
  // The Chipper Chart meter replaces the per-task prompt by default; the
  // prompt itself stays available as a toggle.
  attitude_prompt: false,
  expand_steps: true,
  show_chipper_chart: true,
  allow_child_location: false,
  show_step_timers: false,
  show_visual_schedule: true,
  first_then_only: false,
};
const DEFAULT_LOCK_STATE: LockState = { locked_profile_id: null, options: DEFAULT_LOCK_OPTIONS };

export function useLock(): LockState {
  return useKv<LockState>(LOCK_KEY, DEFAULT_LOCK_STATE);
}

/** The child-view options saved for a profile on this device (Settings > Child view options). */
function lockOptionsKey(profileId: string): string {
  return `lock_options:${profileId}`;
}

export function useSavedLockOptions(profileId: string): LockOptions {
  const saved = useKv<Partial<LockOptions>>(lockOptionsKey(profileId), {});
  return { ...DEFAULT_LOCK_OPTIONS, ...saved };
}

export async function saveLockOptions(profileId: string, options: LockOptions): Promise<void> {
  await setKv<LockOptions>(lockOptionsKey(profileId), options);
}

/** Locks this device to a profile's view, with that profile's saved options unless others are given. */
export async function lockTo(profileId: string, options?: Partial<LockOptions>): Promise<void> {
  const saved = options ?? (await getKv<Partial<LockOptions>>(lockOptionsKey(profileId))) ?? {};
  await setKv<LockState>(LOCK_KEY, {
    locked_profile_id: profileId,
    options: { ...DEFAULT_LOCK_OPTIONS, ...saved },
  });
}

export async function unlock(): Promise<void> {
  await setKv<LockState>(LOCK_KEY, DEFAULT_LOCK_STATE);
}

const PARENT_MODE_KEY = 'parent_mode';

/**
 * Whether this device is currently showing caregiver screens (Today,
 * Settings, edits) instead of the child's default view. Distinct from
 * `locked_profile_id`: that's the caregiver's explicit, native-pinned
 * "Lock this device" kiosk mode; this is the app's own default -- the
 * child view is what a freshly opened or freshly unlocked app shows,
 * caregiver screens are the thing you have to unlock into (PIN or
 * password, see UnlockOverlay), on every device, not just ones the
 * caregiver has bothered to hard-lock.
 */
export function useParentMode(): boolean {
  return useKv<boolean>(PARENT_MODE_KEY, false);
}

/**
 * True once `useParentMode`'s live query has resolved at least once. Same
 * race `useKvLoaded`'s doc warns about: right after UnlockOverlay awaits
 * `enterParentMode()` and navigates, CaregiverShell mounts and reads
 * `useParentMode()` before Dexie's live query has re-run with the just
 * written `true` -- gate the "not in parent mode, bounce to /child/"
 * redirect on this so it doesn't fire on that stale loading tick.
 */
export function useParentModeLoaded(): boolean {
  return useKvLoaded(PARENT_MODE_KEY);
}

export async function enterParentMode(): Promise<void> {
  await setKv<boolean>(PARENT_MODE_KEY, true);
}

/** Also the safe default on a cold app start (session.ts's bootstrap): every fresh open lands on the child view. */
export async function exitParentMode(): Promise<void> {
  await setKv<boolean>(PARENT_MODE_KEY, false);
}

interface PinAttemptsState {
  count: number;
  locked_until: number | null;
}

const PIN_ATTEMPTS_KEY = 'pin_attempts';
const DEFAULT_PIN_ATTEMPTS: PinAttemptsState = { count: 0, locked_until: null };
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export interface PinGate {
  locked: boolean;
  remaining_ms: number;
  recordFailure: () => Promise<void>;
  recordSuccess: () => Promise<void>;
}

/** Five wrong PIN attempts (S24) triggers a thirty-second wait, tracked in kv so it survives offline/reload. */
export function usePinGate(): PinGate {
  const attempts = useKv<PinAttemptsState>(PIN_ATTEMPTS_KEY, DEFAULT_PIN_ATTEMPTS);
  const [remaining_ms, setRemainingMs] = useState(0);

  useEffect(() => {
    const lockedUntil = attempts.locked_until;
    function tick(): void {
      setRemainingMs(lockedUntil !== null ? Math.max(0, lockedUntil - Date.now()) : 0);
    }
    tick();
    if (lockedUntil === null) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempts.locked_until]);

  const locked = remaining_ms > 0;

  const recordFailure = async (): Promise<void> => {
    const current = (await getKv<PinAttemptsState>(PIN_ATTEMPTS_KEY)) ?? DEFAULT_PIN_ATTEMPTS;
    const count = current.count + 1;
    const locked_until = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : current.locked_until;
    await setKv<PinAttemptsState>(PIN_ATTEMPTS_KEY, { count, locked_until });
  };

  const recordSuccess = async (): Promise<void> => {
    await setKv<PinAttemptsState>(PIN_ATTEMPTS_KEY, DEFAULT_PIN_ATTEMPTS);
  };

  return { locked, remaining_ms, recordFailure, recordSuccess };
}

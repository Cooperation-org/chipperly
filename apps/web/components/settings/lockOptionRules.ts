import type { LockOptions } from '@/lib/device/settings';

/**
 * The Chipper Chart and the five-face "How do you feel" check show the same
 * thing to the person using the app, so by default only one is on. Only the
 * view setting changes here; attitude_checks and mood_events rows are never touched.
 */
export type ExclusiveKey = 'show_chipper_chart' | 'attitude_prompt';
type ExclusivePair = Pick<LockOptions, ExclusiveKey>;

const OTHER: Record<ExclusiveKey, ExclusiveKey> = {
  show_chipper_chart: 'attitude_prompt',
  attitude_prompt: 'show_chipper_chart',
};

export function otherOf(key: ExclusiveKey): ExclusiveKey {
  return OTHER[key];
}

/** True when turning `key` on would leave both on, so the UI must ask first. */
export function needsBothConfirm(options: ExclusivePair, key: ExclusiveKey): boolean {
  return !options[key] && options[OTHER[key]];
}

/**
 * Turn `key` on or off. Turning one on turns the other off (`both: false`);
 * `both: true` is the deliberate second step, after the person confirmed they
 * want two similar things. Turning off never touches the other one.
 */
export function setExclusive<T extends ExclusivePair>(options: T, key: ExclusiveKey, on: boolean, both = false): T {
  if (!on) return { ...options, [key]: false };
  return { ...options, [key]: true, [OTHER[key]]: both ? options[OTHER[key]] : false };
}

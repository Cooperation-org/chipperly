// Pure rules and the synthesized sound for the chip/redeem celebration.
// No 'use client', no window access at import time: safe in the static export.
import type { DeviceSettings, LockOptions } from './device/settings';

export interface CelebrationPlan {
  /** Show the star burst. */
  burst: boolean;
  /** Show the still glow instead (reduced motion). */
  glow: boolean;
  sound: boolean;
}

/** `celebrations` is undefined on lock state saved before the option existed, which counts as on. */
export function shouldCelebrate(
  options: Pick<LockOptions, 'celebrations'>,
  device: Pick<DeviceSettings, 'sounds' | 'reduce_motion'>,
  systemReducedMotion: boolean,
): CelebrationPlan {
  if (options.celebrations === false) return { burst: false, glow: false, sound: false };
  const reduced = device.reduce_motion === 'on' || (device.reduce_motion === 'system' && systemReducedMotion);
  return { burst: !reduced, glow: reduced, sound: device.sounds };
}

/** C5, E5, G5 then a soft C6: frequency in Hz and start offset in seconds. */
export const CELEBRATE_NOTES: ReadonlyArray<{ hz: number; at: number }> = [
  { hz: 523.25, at: 0 },
  { hz: 659.25, at: 0.11 },
  { hz: 783.99, at: 0.22 },
];
const NOTE_SECONDS = 0.28;
const VOLUME = 0.08;

let ctx: AudioContext | null = null;

/** Call from a tap handler. Never throws: no AudioContext, or a blocked one, is just silence. */
export function playCelebrateSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    for (const { hz, at } of CELEBRATE_NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(VOLUME, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + NOTE_SECONDS);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + NOTE_SECONDS + 0.02);
    }
  } catch {
    // Audio is a nicety; a blocked or missing context must not break the tap.
  }
}

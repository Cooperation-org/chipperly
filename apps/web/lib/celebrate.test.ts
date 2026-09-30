import { describe, expect, it } from 'vitest';
import { CELEBRATE_NOTES, shouldCelebrate } from './celebrate';

const on = { celebrations: true };
const device = { sounds: true, reduce_motion: 'system' as const };

describe('shouldCelebrate', () => {
  it('bursts with sound by default', () => {
    expect(shouldCelebrate(on, device, false)).toEqual({ burst: true, glow: false, sound: true });
  });
  it('does nothing when the option is off', () => {
    expect(shouldCelebrate({ celebrations: false }, device, false)).toEqual({ burst: false, glow: false, sound: false });
  });
  it('treats a missing option (old saved lock state) as on', () => {
    expect(shouldCelebrate({} as { celebrations: boolean }, device, false).burst).toBe(true);
  });
  it('keeps the sound but swaps the burst for a glow under the system preference', () => {
    expect(shouldCelebrate(on, device, true)).toEqual({ burst: false, glow: true, sound: true });
  });
  it('reduce_motion on wins over the system, off ignores a system preference', () => {
    expect(shouldCelebrate(on, { ...device, reduce_motion: 'on' }, false).glow).toBe(true);
    expect(shouldCelebrate(on, { ...device, reduce_motion: 'off' }, true).burst).toBe(true);
  });
  it('is silent when device sounds are off', () => {
    expect(shouldCelebrate(on, { ...device, sounds: false }, false).sound).toBe(false);
  });
});

describe('CELEBRATE_NOTES', () => {
  it('is a short rising run of three', () => {
    expect(CELEBRATE_NOTES).toHaveLength(3);
    const hz = CELEBRATE_NOTES.map((n) => n.hz);
    expect(hz).toEqual([...hz].sort((a, b) => a - b));
    expect(CELEBRATE_NOTES.at(-1)!.at).toBeLessThan(0.5);
  });
});

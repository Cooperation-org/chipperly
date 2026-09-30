import { describe, it, expect } from 'vitest';
import { settingsAfterPick, settingsWithAudio } from './panelAudio';

describe('panelAudio', () => {
  it('sets one panel without touching the other or other settings', () => {
    const s = settingsWithAudio({ read_aloud: true, first_then_then_audio_id: 'b' }, 'first', 'a');
    expect(s).toEqual({ read_aloud: true, first_then_then_audio_id: 'b', first_then_first_audio_id: 'a' });
  });
  it('keeps the clip when the same item is picked again', () => {
    const before = { first_then_first_audio_id: 'a' };
    expect(settingsAfterPick(before, 'first', 'x', 'x')).toBe(before);
  });
  it('drops that panel clip when a different item is picked', () => {
    const s = settingsAfterPick({ first_then_first_audio_id: 'a', first_then_then_audio_id: 'b' }, 'first', 'x', 'y');
    expect(s.first_then_first_audio_id).toBeNull();
    expect(s.first_then_then_audio_id).toBe('b');
  });
});

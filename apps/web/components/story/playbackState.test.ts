import { describe, expect, it } from 'vitest';
import { playbackReducer, type PlaybackEvent } from './playbackState';

describe('playbackReducer', () => {
  it('turns on only for a real playing event', () => {
    expect(playbackReducer(false, 'playing')).toBe(true);
  });

  it.each<PlaybackEvent>(['pause', 'ended', 'error', 'waiting', 'stop'])('turns off on %s', (event) => {
    expect(playbackReducer(true, event)).toBe(false);
  });

  it('a failed load never leaves it on', () => {
    expect(playbackReducer(playbackReducer(false, 'waiting'), 'error')).toBe(false);
  });
});

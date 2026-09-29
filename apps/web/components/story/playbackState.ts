/** Media/speech events that change whether sound is actually coming out. */
export type PlaybackEvent = 'playing' | 'pause' | 'ended' | 'error' | 'waiting' | 'stop';

/** True only between a real "sound started" event and anything that interrupts it. A click never sets this. */
export function playbackReducer(_playing: boolean, event: PlaybackEvent): boolean {
  return event === 'playing';
}

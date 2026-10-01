// One person's "Play sounds" choice ({name}'s view options), applied while their view is on screen.
// Kept apart from lib/sound.ts so lib/celebrate.ts can read it without loading the audio files.
let on = true;

export function setPersonSounds(next: boolean): void {
  on = next;
}

export function personSoundsOn(): boolean {
  return on;
}

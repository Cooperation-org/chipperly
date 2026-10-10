import { afterEach, describe, expect, it, vi } from 'vitest';

// The first tap prepares every sound with a play-then-pause. That must be silent:
// on a phone all four files were heard at once, at full volume, when the app opened.

interface FakeAudio {
  src: string;
  preload: string;
  muted: boolean;
  currentTime: number;
  paused: boolean;
  /** `muted` at the moment play() was called. */
  mutedAtPlay: boolean[];
  finish: () => void;
}

function installFakes(): { made: FakeAudio[]; tap: () => void } {
  const made: FakeAudio[] = [];
  const listeners: Array<() => void> = [];
  class Audio {
    src = '';
    preload = '';
    muted = false;
    currentTime = 0;
    paused = true;
    mutedAtPlay: boolean[] = [];
    private resolve: (() => void) | null = null;
    constructor() {
      made.push(this as unknown as FakeAudio);
    }
    canPlayType(): string {
      return 'probably';
    }
    play(): Promise<void> {
      this.mutedAtPlay.push(this.muted);
      this.paused = false;
      return new Promise((resolve) => {
        this.resolve = resolve;
      });
    }
    pause(): void {
      this.paused = true;
    }
    finish(): void {
      this.resolve?.();
    }
  }
  vi.stubGlobal('Audio', Audio);
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { addEventListener: (_type: string, fn: () => void) => listeners.push(fn) });
  return { made, tap: () => listeners.forEach((fn) => fn()) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('preparing sounds on the first tap', () => {
  it('plays every file muted, then stops it and takes the mute off again', async () => {
    const { made, tap } = installFakes();
    await import('./sound');
    expect(made).toHaveLength(4);

    tap();
    expect(made.every((a) => a.mutedAtPlay.length === 1 && a.mutedAtPlay[0] === true)).toBe(true);
    // Still silent while the phone has not got round to pausing yet.
    expect(made.every((a) => a.muted)).toBe(true);

    made.forEach((a) => a.finish());
    await new Promise((r) => setTimeout(r, 0));
    expect(made.every((a) => a.paused && a.currentTime === 0 && a.muted === false)).toBe(true);
  });
});

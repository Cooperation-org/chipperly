// Pomodoro ("Focus" mode) progression. Pure: the store owns the countdown,
// this only says which interval comes next and how long it lasts.

export interface FocusSettings {
  focus_min: number;
  short_min: number;
  long_min: number;
  /** A long break follows every Nth focus round. */
  long_every: number;
}

export type FocusPhase = 'focus' | 'break';

export interface FocusState {
  settings: FocusSettings;
  phase: FocusPhase;
  /** 1-based focus round; a break belongs to the round it follows. */
  round: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = { focus_min: 25, short_min: 5, long_min: 15, long_every: 4 };

export function newFocus(settings: FocusSettings = DEFAULT_FOCUS_SETTINGS): FocusState {
  return { settings, phase: 'focus', round: 1 };
}

export function isLongBreak(f: FocusState): boolean {
  return f.phase === 'break' && f.round % f.settings.long_every === 0;
}

export function intervalMs(f: FocusState): number {
  const { settings } = f;
  const min = f.phase === 'focus' ? settings.focus_min : isLongBreak(f) ? settings.long_min : settings.short_min;
  return min * 60_000;
}

/** focus -> break -> next round's focus. */
export function nextInterval(f: FocusState): FocusState {
  return f.phase === 'focus' ? { ...f, phase: 'break' } : { ...f, phase: 'focus', round: f.round + 1 };
}

export function focusLabel(f: FocusState): string {
  if (f.phase === 'focus') return `Focus, round ${f.round}`;
  return isLongBreak(f) ? `Long break after round ${f.round}` : `Break after round ${f.round}`;
}

/** Keep typed values usable: whole minutes 1..180, long_every 2..12. */
export function sanitizeSettings(s: FocusSettings): FocusSettings {
  const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n) || lo));
  return {
    focus_min: clamp(s.focus_min, 1, 180),
    short_min: clamp(s.short_min, 1, 180),
    long_min: clamp(s.long_min, 1, 180),
    long_every: clamp(s.long_every, 2, 12),
  };
}

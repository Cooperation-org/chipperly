// The toast's state and countdown, apart from ToastHost so it can be tested without React.

export interface ToastOptions {
  /** Shorthand for an "Undo" action button. */
  undo?: () => void;
  /** Custom action label; defaults to "Undo" when `undo` is set instead. */
  action?: string;
  onAction?: () => void;
  duration_ms?: number;
  /** Fired just before a navigation and meant for the screen being opened: survives that one route change. */
  carry?: boolean;
}

interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  carry?: boolean;
  duration_ms: number;
}

// Module singleton: one toast at a time, read via useSyncExternalStore so any
// number of client components can call toast() without a provider.
let current: ToastState | null = null;
let counter = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return current;
}

/** The toast on screen now, or null. */
export const currentToast = getSnapshot;

export function getServerSnapshot() {
  return null;
}

export function toast(message: string, opts: ToastOptions = {}): void {
  const { undo, action, onAction, duration_ms = 5000, carry } = opts;
  const actionLabel = action ?? (undo ? 'Undo' : undefined);
  const handler = onAction ?? undo;

  counter += 1;
  current = { id: counter, message, actionLabel, onAction: handler, carry, duration_ms };
  emit();
  release();
}

/** Stops the countdown while the pointer is over the toast or it has focus, so its action never vanishes mid-reach. */
export function hold(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
}

/** Starts the countdown again, from the full duration. */
export function release(): void {
  if (hideTimer) clearTimeout(hideTimer);
  if (!current) return;
  hideTimer = setTimeout(() => {
    current = null;
    emit();
  }, current.duration_ms);
}

export function dismiss() {
  if (hideTimer) clearTimeout(hideTimer);
  current = null;
  emit();
}

/** A toast fired on one screen never bleeds onto the next, unless it was fired for that screen (`carry`). */
export function routeChanged(): void {
  if (current?.carry) current.carry = false;
  else dismiss();
}

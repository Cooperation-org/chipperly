'use client';

import { useSyncExternalStore } from 'react';
import styles from './toast.module.css';

export interface ToastOptions {
  /** Shorthand for an "Undo" action button. */
  undo?: () => void;
  /** Custom action label; defaults to "Undo" when `undo` is set instead. */
  action?: string;
  onAction?: () => void;
  duration_ms?: number;
}

interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
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

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

function getServerSnapshot() {
  return null;
}

export function toast(message: string, opts: ToastOptions = {}): void {
  const { undo, action, onAction, duration_ms = 5000 } = opts;
  const actionLabel = action ?? (undo ? 'Undo' : undefined);
  const handler = onAction ?? undo;

  if (hideTimer) clearTimeout(hideTimer);
  counter += 1;
  current = { id: counter, message, actionLabel, onAction: handler };
  emit();
  hideTimer = setTimeout(() => {
    current = null;
    emit();
  }, duration_ms);
}

function dismiss() {
  if (hideTimer) clearTimeout(hideTimer);
  current = null;
  emit();
}

/** Mounted once near the app root. Shows the current toast above the tab bar. */
export function ToastHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!state) return null;

  return (
    <div className={styles.host}>
      <div className={styles.toast} role="status">
        <span className={styles.message}>{state.message}</span>
        {state.actionLabel && state.onAction ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              state.onAction?.();
              dismiss();
            }}
          >
            {state.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

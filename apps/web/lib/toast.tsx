'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import styles from './toast.module.css';

import { dismiss, getServerSnapshot, getSnapshot, hold, release, routeChanged, subscribe } from './toastStore';

export { currentToast, toast, type ToastOptions } from './toastStore';

/** Mounted once near the app root. Shows the current toast above the tab bar. */
export function ToastHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  // A toast fired on one screen must never bleed onto the next screen the
  // caregiver navigates to, unless it was fired for that screen (`carry`).
  useEffect(() => {
    routeChanged();
  }, [pathname]);

  if (!state) return null;

  return (
    <div className={styles.host}>
      <div className={styles.toast} role="status" onPointerEnter={hold} onPointerLeave={release} onFocus={hold} onBlur={release}>
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

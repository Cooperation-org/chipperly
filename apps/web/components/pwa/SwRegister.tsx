'use client';

import { useEffect } from 'react';
import { withBase } from '@/lib/api/base';
import { toast } from '@/lib/toast';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// How often an open app asks whether a new build is deployed. The browser
// only does this itself on navigation (or daily), and a child's locked
// tablet can sit on one page all day. Each check is one small no-cache
// request for sw.js; ponytail: fixed interval, push a "new version" message
// over FCM instead if deploys ever need to land faster than this.
const UPDATE_CHECK_MS = 15 * 60_000;

/** Someone is typing: don't pull the page out from under them. */
function isEditing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement | null)?.isContentEditable === true;
}

/**
 * Registers the Serwist-built service worker (`register: false` in
 * next.config.ts). sw.ts uses skipWaiting, so a new version takes control
 * as soon as it installs; this reloads once it has (`controllerchange`),
 * so the page runs the new build instead of old code whose lazy chunks the
 * server no longer has. If someone is typing, it offers the reload instead.
 * It also checks for a new build every UPDATE_CHECK_MS and whenever the
 * app comes back to the foreground, not only when the page is loaded.
 */
export function SwRegister(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Only an update replaces a controller; the very first install (no
    // controller yet) takes control without needing a reload.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    function onControllerChange(): void {
      if (!hadController || reloaded) return;
      if (isEditing()) {
        toast('Update ready', { action: 'Reload', onAction: () => window.location.reload() });
        return;
      }
      reloaded = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    // A changed sw.js (every deploy changes its precache list) installs,
    // takes over (skipWaiting), drops the old build's cached files, and
    // onControllerChange above reloads into the new build.
    function checkForUpdate(): void {
      void registration?.update().catch(() => {
        // Offline or server unreachable: try again on the next check.
      });
    }
    function onVisible(): void {
      if (document.visibilityState === 'visible') checkForUpdate();
    }

    navigator.serviceWorker
      .register(withBase('/sw.js'), { scope: `${basePath}/` })
      .then((reg) => {
        registration = reg;
      })
      .catch(() => {
        // Offline-first app; a failed registration just means no SW this load.
      });
    const interval = setInterval(checkForUpdate, UPDATE_CHECK_MS);
    // Coming back to the app (tab switch, unlocking the phone) checks straight away.
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}

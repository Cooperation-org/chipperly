'use client';

import { useEffect } from 'react';
import { withBase } from '@/lib/api/base';
import { toast } from '@/lib/toast';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

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

    navigator.serviceWorker.register(withBase('/sw.js'), { scope: `${basePath}/` }).catch(() => {
      // Offline-first app; a failed registration just means no SW this load.
    });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}

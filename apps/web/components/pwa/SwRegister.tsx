'use client';

import { useEffect } from 'react';
import { withBase } from '@/lib/api/base';
import { toast } from '@/lib/toast';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function showUpdateToast(registration: ServiceWorkerRegistration): void {
  toast('Update ready', {
    action: 'Reload',
    onAction: () => {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    },
  });
}

/** Registers the Serwist-built service worker (`register: false` in next.config.ts) and offers a reload on update. */
export function SwRegister(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register(withBase('/sw.js'), { scope: `${basePath}/` })
      .then((registration) => {
        if (cancelled) return;

        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(registration);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(registration);
            }
          });
        });
      })
      .catch(() => {
        // Offline-first app; a failed registration just means no SW this load.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

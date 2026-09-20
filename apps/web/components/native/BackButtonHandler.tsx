'use client';

import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';

/**
 * Without this, Android's hardware/gesture back button falls through to the
 * Activity's default handling and exits the app instead of going back a
 * screen (Capacitor's Bridge doesn't wire this up itself). No-ops in a plain
 * browser tab: `backButton` only ever fires inside the native shell.
 */
export function BackButtonHandler(): null {
  useEffect(() => {
    const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void CapApp.exitApp();
      }
    });

    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);

  return null;
}

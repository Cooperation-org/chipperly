'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import AppBlocker from './appBlocker';

/**
 * True on an Android device whose app-blocking accessibility service is on,
 * i.e. when "Lock phone" (lock + block other apps) can actually do what it
 * says. Rechecked on returning to the app, since that's granted in system
 * Settings.
 */
export function useBlockingReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    function check(): void {
      void AppBlocker.isServiceEnabled().then(({ enabled }) => setReady(enabled));
    }
    function onVisible(): void {
      if (document.visibilityState === 'visible') check();
    }
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return ready;
}

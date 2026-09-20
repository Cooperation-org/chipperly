'use client';

import { useEffect, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/lib/auth/session';
import { startSync, stopSync } from '@/lib/sync/engine';
import { useKv } from '@/lib/db/kv';
import { SheetHost } from '@/components/ui/Sheet';
import { ToastHost } from '@/lib/toast';
import { SwRegister } from '@/components/pwa/SwRegister';
import { BackButtonHandler } from '@/components/native/BackButtonHandler';
import { TimerKioskGuard } from '@/components/native/TimerKioskGuard';
import { AppBlockerGuard } from '@/components/native/AppBlockerGuard';

interface DeviceSettings {
  reduce_motion?: 'system' | 'on' | 'off';
}

/** Starts/stops the sync loop with the session: nothing to sync while signed out. */
function SyncProvider({ children }: { children: ReactNode }): ReactNode {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'signed_in') return;
    startSync();
    return () => stopSync();
  }, [status]);

  return children;
}

/** `[data-reduce-motion]` on `<html>`, driven by the device setting (CONTRACTS.md tokens.css). */
function ReducedMotion(): null {
  const settings = useKv<DeviceSettings>('device_settings', {});

  useEffect(() => {
    // 'system' sets no override: the CSS `prefers-reduced-motion: reduce` query (tokens.css) already covers it.
    document.documentElement.dataset.reduceMotion = settings.reduce_motion === 'on' ? 'true' : 'false';
  }, [settings.reduce_motion]);

  return null;
}

export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <SessionProvider>
      <SyncProvider>
        <ReducedMotion />
        {children}
        <SheetHost />
        <ToastHost />
        <SwRegister />
        <BackButtonHandler />
        <TimerKioskGuard />
        <AppBlockerGuard />
      </SyncProvider>
    </SessionProvider>
  );
}

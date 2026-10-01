'use client';

import { useEffect, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/lib/auth/session';
import { useCarryOverPhase } from '@/lib/auth/carryOver';
import { CarryOverScreen } from '@/components/auth/CarryOverScreen';
import { startSync, stopSync } from '@/lib/sync/engine';
import { useKv } from '@/lib/db/kv';
import { SheetHost } from '@/components/ui/Sheet';
import { ToastHost } from '@/lib/toast';
import { reportError } from '@/lib/reportError';
import { SwRegister } from '@/components/pwa/SwRegister';
import { BackButtonHandler } from '@/components/native/BackButtonHandler';
import { TimerKioskGuard } from '@/components/native/TimerKioskGuard';
import { AppBlockerGuard } from '@/components/native/AppBlockerGuard';
import { LockTaskReconcileGuard } from '@/components/native/LockTaskReconcileGuard';
import { PushRegistrationGuard } from '@/components/native/PushRegistrationGuard';
import { DeviceRegistrationGuard } from '@/components/native/DeviceRegistrationGuard';

interface DeviceSettings {
  reduce_motion?: 'system' | 'on' | 'off';
}

/** Starts/stops the sync loop with the session: nothing to sync while signed out. */
function SyncProvider({ children }: { children: ReactNode }): ReactNode {
  const { status } = useSession();
  // Holds sync back while a guest's work is being moved into the new account: the old guest profile would 403 on pull.
  const carry = useCarryOverPhase();

  useEffect(() => {
    if (status !== 'signed_in' || carry !== 'idle') return;
    startSync();
    return () => stopSync();
  }, [status, carry]);

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

/**
 * Uncaught errors and rejected promises go to the server log (lib/reportError.ts).
 * Only for a signed-in account: a guest's device sends nothing, and neither does a signed-out visitor.
 */
function ErrorReporter(): null {
  const { status, guest } = useSession();
  const on = status === 'signed_in' && !guest;

  useEffect(() => {
    if (!on) return;
    const onError = (event: ErrorEvent): void => reportError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent): void => reportError(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [on]);

  return null;
}

export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <SessionProvider>
      <SyncProvider>
        <ReducedMotion />
        <ErrorReporter />
        {children}
        <SheetHost />
        <ToastHost />
        <CarryOverScreen />
        <SwRegister />
        <BackButtonHandler />
        <TimerKioskGuard />
        <AppBlockerGuard />
        <LockTaskReconcileGuard />
        <PushRegistrationGuard />
        <DeviceRegistrationGuard />
      </SyncProvider>
    </SessionProvider>
  );
}

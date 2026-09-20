'use client';

import { useEffect, useRef } from 'react';
import { useTimer } from '@/lib/timer/store';
import Kiosk from '@/lib/native/kiosk';

/**
 * Engages the OS-level kiosk lock for as long as a locked child step timer
 * is running -- independent of whether TimerFullScreen happens to be open,
 * since dismissing that overlay to see the pill must not let the device
 * out of the app while the timer keeps counting down.
 */
export function TimerKioskGuard(): null {
  const timer = useTimer();
  const wasLocked = useRef(false);

  useEffect(() => {
    if (timer.locked === wasLocked.current) return;
    wasLocked.current = timer.locked;
    if (timer.locked) {
      void Kiosk.enterFocusMode({ profileName: '' });
    } else {
      void Kiosk.exitFocusMode();
    }
  }, [timer.locked]);

  return null;
}

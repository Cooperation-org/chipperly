'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTimer, isEnded } from '@/lib/timer/store';
import { Icon } from '@/components/ui/Icon';
import { formatTimerTime } from './time';
import { TimerFullScreen } from './TimerFullScreen';
import styles from './TimerPill.module.css';

/** The running-timer pill shown above the tab bar on every screen but the Timer tab itself. */
export function TimerPill() {
  const timer = useTimer();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const justEnded = isEnded(timer);
  const visible = (timer.running || justEnded) && pathname !== '/timer/';

  // Forget an open overlay when the pill hides (navigated to the Timer tab, or
  // the end was acknowledged). Otherwise `open` stays true and the overlay
  // pops straight back up the next time the pill shows.
  if (!visible) {
    if (open) setOpen(false);
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen(true)}
        aria-label={`Timer, ${formatTimerTime(timer.remaining_ms)} remaining`}
      >
        <Icon name="clock" size={18} />
        <span className={styles.time}>{formatTimerTime(timer.remaining_ms)}</span>
      </button>
      {open ? <TimerFullScreen onClose={() => setOpen(false)} /> : null}
    </>
  );
}

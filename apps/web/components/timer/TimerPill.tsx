'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTimer } from '@/lib/timer/store';
import { Icon } from '@/components/ui/Icon';
import { formatTimerTime } from './time';
import { TimerFullScreen } from './TimerFullScreen';
import styles from './TimerPill.module.css';

/** The running-timer pill shown above the tab bar on every screen but the Timer tab itself. */
export function TimerPill() {
  const timer = useTimer();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const justEnded = timer.ended_at !== null && timer.remaining_ms === 0;
  const visible = (timer.running || justEnded) && pathname !== '/timer/';

  if (!visible) return null;

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

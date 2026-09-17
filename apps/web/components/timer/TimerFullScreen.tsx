'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTimer, start, pause } from '@/lib/timer/store';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Celebration } from '@/components/ui/Celebration';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { TimerRing } from './TimerRing';
import { useSquareSize } from './useSquareSize';
import styles from './TimerFullScreen.module.css';

export interface TimerFullScreenProps {
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** S14: the timer full screen. Tap anywhere to pause/resume, close top-right, screen kept awake
 * with the Wake Lock API while running (best-effort: unsupported or denied just lets it sleep). */
export function TimerFullScreen({ onClose }: TimerFullScreenProps) {
  const timer = useTimer();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [celebrationDone, setCelebrationDone] = useState(false);

  const justEnded = timer.ended_at !== null && timer.remaining_ms === 0;
  const [boxRef, ringSize] = useSquareSize(!justEnded, 280);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function acquire(): Promise<void> {
      if (!timer.running || !('wakeLock' in navigator)) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        // ponytail: no fallback; the screen may just sleep on devices/contexts that refuse the lock
      }
    }
    void acquire();
    return () => {
      cancelled = true;
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [timer.running]);

  function toggle(): void {
    if (timer.running) {
      pause();
      setAnnouncement('Paused');
    } else if (timer.remaining_ms > 0) {
      start();
      setAnnouncement('Resumed');
    }
  }

  const content = (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Timer" ref={panelRef} tabIndex={-1}>
      <IconButton icon="close" aria-label="Close timer" variant="solid" className={styles.close} onClick={onClose} />
      {justEnded ? (
        <div className={styles.ended}>
          {!celebrationDone ? <Celebration kind="check" onDone={() => setCelebrationDone(true)} /> : null}
          <p className={styles.endedText}>Time&rsquo;s up</p>
          <Button variant="primary" size="lg" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.tapZone}
          onClick={toggle}
          aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
        >
          <div ref={boxRef} className={styles.ringBox}>
            <TimerRing remaining_ms={timer.remaining_ms} total_ms={timer.total_ms} reveal={timer.reveal} size={ringSize} />
          </div>
        </button>
      )}
      <VisuallyHidden>
        <span aria-live="polite">{justEnded ? "Time's up" : announcement}</span>
      </VisuallyHidden>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

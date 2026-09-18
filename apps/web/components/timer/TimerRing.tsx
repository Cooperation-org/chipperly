'use client';

import { useEffect, useState } from 'react';
import { useMediaUrl } from '@/lib/data/media';
import type { TimerReveal } from '@/lib/timer/store';
import { formatTimerTime } from './time';
import styles from './TimerRing.module.css';

export interface TimerRingProps {
  remaining_ms: number;
  total_ms: number;
  reveal?: TimerReveal | null;
  size: number;
  onTap?: () => void;
}

const STROKE_RATIO = 0.06;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const check = () => setReduced(mq.matches || document.documentElement.dataset.reduceMotion === 'true');
    check();
    mq.addEventListener('change', check);
    return () => mq.removeEventListener('change', check);
  }, []);
  return reduced;
}

/** SVG countdown ring: the primary-colored arc is the remaining fraction, shrinking to nothing at zero.
 * An optional reveal (emoji or photo) sits behind it and fades in as time passes; under reduced motion
 * it steps at 25/50/75/100% elapsed instead of animating continuously. */
export function TimerRing({ remaining_ms, total_ms, reveal, size, onTap }: TimerRingProps) {
  const reduceMotion = useReducedMotion();
  const photoUrl = useMediaUrl(reveal?.photo_id ?? null);

  const progress = total_ms > 0 ? Math.min(1, Math.max(0, remaining_ms / total_ms)) : 0;
  const elapsed = 1 - progress;
  const revealOpacity = reveal ? (reduceMotion ? Math.floor(elapsed * 4) / 4 : elapsed) : 0;

  const strokeWidth = size * STROKE_RATIO;
  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - progress);

  return (
    <div
      className={[styles.wrap, onTap ? styles.tappable : ''].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      onClick={onTap}
      role={onTap ? 'button' : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={
        onTap
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTap();
              }
            }
          : undefined
      }
      aria-label={onTap ? `Timer, ${formatTimerTime(remaining_ms)} remaining` : undefined}
    >
      {reveal ? (
        <div className={styles.reveal} style={{ opacity: revealOpacity }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API
            <img src={photoUrl} alt="" className={styles.revealImg} />
          ) : reveal.emoji ? (
            <span className={styles.revealEmoji} aria-hidden="true">
              {reveal.emoji}
            </span>
          ) : null}
        </div>
      ) : null}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.svg} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-2)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={styles.progress}
        />
      </svg>
      <span className={styles.time} aria-hidden={onTap ? 'true' : undefined}>
        {formatTimerTime(remaining_ms)}
      </span>
    </div>
  );
}

'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { levelEmoji, MOOD_MAX, MOOD_MIN } from '@/lib/data/mood';
import { Icon } from '@/components/ui/Icon';
import styles from './MoodMeter.module.css';

export interface MoodMeterProps {
  level: number;
  onChange: (next: number) => void;
}

const TICKS = [-3, -1, 1, 3];

function pct(level: number): number {
  return ((level - MOOD_MIN) / (MOOD_MAX - MOOD_MIN)) * 100;
}

function levelFromClientX(clientX: number, rect: DOMRect): number {
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(MOOD_MIN + ratio * (MOOD_MAX - MOOD_MIN));
}

/**
 * The red-to-green bar with tick marks and a face marker (beta's Chipper
 * Chart, `audio-snippet.js`): minus / bar / plus, all driving the same
 * `level`. Reused by the caregiver page and the child-mode sheet.
 */
export function MoodMeter({ level, onChange }: MoodMeterProps) {
  const barRef = useRef<HTMLDivElement>(null);

  function tapToLevel(clientX: number): void {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    onChange(levelFromClientX(clientX, rect));
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    tapToLevel(e.clientX);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(level + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(level - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(MOOD_MIN);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(MOOD_MAX);
    }
  }

  return (
    <div className={styles.meterRow}>
      <button
        type="button"
        className={styles.minus}
        aria-label="Decrease mood"
        disabled={level <= MOOD_MIN}
        onClick={() => onChange(level - 1)}
      >
        <Icon name="minus" size={24} />
      </button>

      <div
        ref={barRef}
        className={styles.bar}
        role="slider"
        tabIndex={0}
        aria-label="Mood level"
        aria-valuemin={MOOD_MIN}
        aria-valuemax={MOOD_MAX}
        aria-valuenow={level}
        aria-valuetext={`${level > 0 ? '+' : ''}${level}`}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        {TICKS.map((t) => (
          <span key={t} className={styles.tick} style={{ left: `${pct(t)}%` }} aria-hidden="true" />
        ))}
        <span className={styles.face} style={{ left: `${pct(level)}%` }} aria-hidden="true">
          {levelEmoji(level)}
        </span>
      </div>

      <button
        type="button"
        className={styles.plus}
        aria-label="Increase mood"
        disabled={level >= MOOD_MAX}
        onClick={() => onChange(level + 1)}
      >
        <Icon name="plus" size={24} />
      </button>
    </div>
  );
}

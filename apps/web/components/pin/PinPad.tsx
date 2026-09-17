'use client';

import { useEffect, useRef, useState } from 'react';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import styles from './PinPad.module.css';

export type PinPadLength = 4 | 5 | 6;

export interface PinPadProps {
  /** Fixed length auto-submits at that many digits. Omitted: 4-6 digits, submitted with the OK key. */
  length?: PinPadLength;
  onComplete: (pin: string) => void | Promise<boolean>;
  /** Shown above the dots and announced to screen readers (S24 "usable with a screen reader"). */
  error?: string;
  title?: string;
}

const ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];
const MIN_FLEXIBLE = 4;
const MAX_FLEXIBLE = 6;

/** S24: large digit pad, dots for entered digits, no keyboard required (a physical one also works). */
export function PinPad({ length, onComplete, error, title }: PinPadProps) {
  const [digits, setDigits] = useState('');
  const [shaking, setShaking] = useState(false);
  const busyRef = useRef(false);

  // Physical keyboard digits work too (S24), without requiring pad focus.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') addDigit(e.key);
      else if (e.key === 'Backspace') removeDigit();
      else if (e.key === 'Enter' && !length) void submit();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, length]);

  function addDigit(d: string): void {
    setDigits((cur) => {
      const max = length ?? MAX_FLEXIBLE;
      if (cur.length >= max) return cur;
      const next = cur + d;
      if (length && next.length === length) void submit(next);
      return next;
    });
  }

  function removeDigit(): void {
    setDigits((cur) => cur.slice(0, -1));
  }

  async function submit(pin: string = digits): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    const result = await onComplete(pin);
    busyRef.current = false;
    if (result === false) {
      setShaking(true);
      setDigits('');
      setTimeout(() => setShaking(false), 260);
    }
  }

  const okEnabled = !length && digits.length >= MIN_FLEXIBLE && digits.length <= MAX_FLEXIBLE;

  return (
    <div className={styles.pad}>
      {title ? <p className={styles.title}>{title}</p> : null}
      <div className={[styles.dots, shaking ? styles.shake : ''].filter(Boolean).join(' ')}>
        {Array.from({ length: length ?? MAX_FLEXIBLE }).map((_, i) => (
          <span key={i} className={[styles.dot, i < digits.length ? styles.filled : ''].filter(Boolean).join(' ')} aria-hidden="true" />
        ))}
      </div>
      <VisuallyHidden>
        <span aria-live="polite">
          {digits.length} digit{digits.length === 1 ? '' : 's'} entered
        </span>
      </VisuallyHidden>
      <p className={styles.error} role="alert">
        {error ?? ''}
      </p>
      <div className={styles.grid}>
        {ROWS.flat().map((d) => (
          <button key={d} type="button" className={styles.key} onClick={() => addDigit(d)}>
            {d}
          </button>
        ))}
        {length ? (
          <span className={[styles.key, styles.ghost].join(' ')} aria-hidden="true" />
        ) : (
          <button type="button" className={[styles.key, styles.ok].join(' ')} disabled={!okEnabled} onClick={() => void submit()}>
            OK
          </button>
        )}
        <button type="button" className={styles.key} onClick={() => addDigit('0')}>
          0
        </button>
        <button type="button" className={styles.key} aria-label="Backspace" onClick={removeDigit}>
          ⌫
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ChipBoard.module.css';

export interface ChipBoardProps {
  filled: number;
  total: number;
}

/** Large read-only chips for the Chips tab. The most recently earned chip pops in on increase. */
export function ChipBoard({ filled, total }: ChipBoardProps) {
  const prevFilled = useRef(filled);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (filled > prevFilled.current) {
      setPoppedIndex(filled - 1);
    }
    prevFilled.current = filled;
  }, [filled]);

  return (
    <div className={styles.board} role="img" aria-label={`${filled} of ${total} chips`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={[styles.chip, i < filled ? styles.filled : '', i === poppedIndex ? styles.pop : ''].filter(Boolean).join(' ')}
          onAnimationEnd={() => setPoppedIndex((current) => (current === i ? null : current))}
        />
      ))}
    </div>
  );
}

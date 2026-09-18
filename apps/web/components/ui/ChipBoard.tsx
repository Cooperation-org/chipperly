'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ChipBoard.module.css';

export type ChipTone = 'positive' | 'neutral' | 'negative';

export interface ChipBoardProps {
  filled: number;
  total: number;
  /** One entry per filled chip, oldest first. Omit to leave every chip's look and labeling unchanged. */
  tones?: Array<ChipTone | null>;
}

const TONE_WORD: Record<ChipTone, string> = { positive: 'positive', neutral: 'neutral', negative: 'negative' };

/** Large read-only chips for the Chips tab. The most recently earned chip pops in on increase. */
export function ChipBoard({ filled, total, tones }: ChipBoardProps) {
  const prevFilled = useRef(filled);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (filled > prevFilled.current) {
      setPoppedIndex(filled - 1);
    }
    prevFilled.current = filled;
  }, [filled]);

  // With tones, each filled chip carries its own label, so the board itself
  // is a group (not one flattened "img") and unfilled chips stay decorative.
  const toned = tones !== undefined;

  return (
    <div className={styles.board} role={toned ? 'group' : 'img'} aria-label={`${filled} of ${total} chips`}>
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        const tone = toned && isFilled ? (tones[i] ?? null) : null;
        return (
          <span
            key={i}
            className={[
              styles.chip,
              isFilled ? styles.filled : '',
              i === poppedIndex ? styles.pop : '',
              tone ? styles[tone] : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onAnimationEnd={() => setPoppedIndex((current) => (current === i ? null : current))}
            role={tone ? 'img' : undefined}
            aria-label={tone ? `chip ${i + 1}, earned with a ${TONE_WORD[tone]} attitude` : undefined}
            aria-hidden={toned && !isFilled ? true : undefined}
          />
        );
      })}
    </div>
  );
}

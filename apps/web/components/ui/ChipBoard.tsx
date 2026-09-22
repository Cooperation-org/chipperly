'use client';

import { useEffect, useRef, useState } from 'react';
import { ChipStar } from './ChipStar';
import { VisuallyHidden } from './VisuallyHidden';
import styles from './ChipBoard.module.css';

export type ChipTone = 'positive' | 'neutral' | 'negative';

export interface ChipBoardProps {
  filled: number;
  total: number;
  /** One entry per filled chip, oldest first. Omit to leave every chip's look and labeling unchanged. */
  tones?: Array<ChipTone | null>;
  /**
   * Makes every chip its own tap target -- touch a chip to set the board to
   * that count (fills up through an empty one, empties back down through a
   * filled one), the same touch-a-chip-to-earn-it interaction the pre-rebuild
   * app had. Ignored when `tones` is given: attitude coloring is a record of
   * how each chip was already earned, not something a tap should rewrite.
   */
  onSetFilled?: (next: number) => void;
}

const TONE_WORD: Record<ChipTone, string> = { positive: 'positive', neutral: 'neutral', negative: 'negative' };

/** The brand-star chips for the Chips tab: read-only, or tappable when `onSetFilled` is given.
 * The most recently earned chip pops in on increase either way. */
export function ChipBoard({ filled, total, tones, onSetFilled }: ChipBoardProps) {
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
  const interactive = Boolean(onSetFilled) && !toned;

  return (
    <>
      {/* role="img" can't contain the interactive chip buttons below (ARIA), so an
          interactive board loses its one summary label; this restores an announced
          (and Playwright-queryable) "N of M chips" without duplicating it visually. */}
      {interactive ? (
        <VisuallyHidden>
          <span role="status" aria-label={`${filled} of ${total} chips`}>
            {filled} of {total} chips
          </span>
        </VisuallyHidden>
      ) : null}
      <div
        className={styles.board}
        role={toned || interactive ? 'group' : 'img'}
        aria-label={toned || interactive ? undefined : `${filled} of ${total} chips`}
      >
        {Array.from({ length: total }).map((_, i) => {
          const isFilled = i < filled;
          const tone = toned && isFilled ? (tones[i] ?? null) : null;
          const chipClassName = [styles.chip, i === poppedIndex ? styles.pop : ''].filter(Boolean).join(' ');
          const onPopEnd = () => setPoppedIndex((current) => (current === i ? null : current));
          const star = <ChipStar size="100%" muted={!isFilled} tone={tone} />;

          if (interactive) {
            // Tapping an unfilled chip fills up through it; tapping a filled
            // one empties back down through it -- a star-rating-style click.
            const next = isFilled ? i : i + 1;
            return (
              <button
                key={i}
                type="button"
                className={[chipClassName, styles.chipButton].filter(Boolean).join(' ')}
                onAnimationEnd={onPopEnd}
                aria-label={`Set chips to ${next} of ${total}`}
                onClick={() => onSetFilled?.(next)}
              >
                {star}
              </button>
            );
          }

          return (
            <span
              key={i}
              className={chipClassName}
              onAnimationEnd={onPopEnd}
              role={tone ? 'img' : undefined}
              aria-label={tone ? `chip ${i + 1}, earned with a ${TONE_WORD[tone]} attitude` : undefined}
              aria-hidden={toned && !isFilled ? true : undefined}
            >
              {star}
            </span>
          );
        })}
      </div>
    </>
  );
}

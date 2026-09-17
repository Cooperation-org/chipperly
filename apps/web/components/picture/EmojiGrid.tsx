'use client';

import { EMOJI_CHOICES } from '@chipperly/shared/constants/emoji';
import styles from './EmojiGrid.module.css';

export interface EmojiGridProps {
  value?: string | null;
  onChange: (emoji: string) => void;
  choices?: readonly string[];
}

/** 6-across grid of emoji, one selectable at a time. */
export function EmojiGrid({ value, onChange, choices = EMOJI_CHOICES }: EmojiGridProps) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label="Choose a picture">
      {choices.map((emoji) => {
        const checked = emoji === value;
        return (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={emoji}
            className={[styles.cell, checked ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

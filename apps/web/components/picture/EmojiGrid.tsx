'use client';

import { useEffect, useState } from 'react';
import { EMOJI_CHOICES } from '@chipperly/shared/constants/emoji';
import { searchEmoji, type EmojiRow } from '@/lib/emoji/search';
import styles from './EmojiGrid.module.css';

export interface EmojiGridProps {
  value?: string | null;
  onChange: (emoji: string) => void;
  choices?: readonly string[];
}

/** A search box over a grid of emoji, one selectable at a time. The grid shows `choices` until something is typed, then matches from every emoji. */
export function EmojiGrid({ value, onChange, choices = EMOJI_CHOICES }: EmojiGridProps) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<EmojiRow[] | null>(null);
  const searching = query.trim() !== '';

  // The word list is 87 KB, so it loads on the first keystroke, not with the form.
  useEffect(() => {
    if (!searching || rows) return;
    let live = true;
    void import('@/lib/emoji/all.json').then((mod) => {
      if (live) setRows(mod.default as EmojiRow[]);
    });
    return () => {
      live = false;
    };
  }, [searching, rows]);

  // A picture found by search earlier is not among the choices: lead with it so it still shows as picked.
  const idle = value && !choices.includes(value) ? [value, ...choices] : choices;
  const shown = searching ? searchEmoji(rows ?? [], query) : idle;

  return (
    <div className={styles.wrap}>
      <input
        type="search"
        className={styles.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search all emoji"
        aria-label="Search all emoji"
        autoComplete="off"
        enterKeyHint="search"
      />
      {searching && rows && shown.length === 0 ? (
        <p className={styles.none} role="status">
          No emoji for &quot;{query.trim()}&quot;
        </p>
      ) : null}
      <div className={styles.grid} role="radiogroup" aria-label="Choose a picture">
        {shown.map((emoji) => {
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
    </div>
  );
}

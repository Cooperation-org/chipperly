'use client';

import { useRef } from 'react';
import { addDays, formatDayLabel, todayIso } from '@chipperly/shared/helpers/date';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import styles from './DateNav.module.css';

export interface DateNavProps {
  isoDate: string;
  onChange: (iso: string) => void;
}

/** Prev / date / next, a "Today" jump, and the platform date input behind the label. No month grid. */
export function DateNav({ isoDate, onChange }: DateNavProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
    }
  }

  return (
    <div className={styles.nav}>
      <IconButton icon="arrowLeft" aria-label="Previous day" onClick={() => onChange(addDays(isoDate, -1))} />
      <div className={styles.dateWrap}>
        <button type="button" className={styles.label} onClick={openPicker}>
          {formatDayLabel(isoDate)}
        </button>
        <input
          ref={inputRef}
          type="date"
          className={styles.hiddenInput}
          value={isoDate}
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        />
      </div>
      <IconButton icon="arrowRight" aria-label="Next day" onClick={() => onChange(addDays(isoDate, 1))} />
      {isoDate !== todayIso() ? (
        <Button variant="ghost" onClick={() => onChange(todayIso())}>
          Today
        </Button>
      ) : null}
    </div>
  );
}

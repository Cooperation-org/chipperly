'use client';

import { useEffect, useState } from 'react';
import { todayIso } from '@chipperly/shared/helpers/date';

/** Today's date, kept current: a screen left open past midnight (a pinned tablet) moves to the new day. */
export function useTodayIso(): string {
  const [isoDate, setIsoDate] = useState(() => todayIso());
  useEffect(() => {
    // Same string means no re-render, so checking often is free.
    const check = (): void => setIsoDate(todayIso());
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return isoDate;
}

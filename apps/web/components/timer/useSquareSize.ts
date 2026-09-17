'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Measures a ref'd box's rendered size via ResizeObserver and returns the
 * smaller of its width/height (so a CSS-sized box stays square). Lets a
 * breakpoint-driven CSS class control the ring's footprint without
 * duplicating TimerRing's own size math (S13's card ring and S14's full
 * screen ring both use this).
 */
export function useSquareSize(active: boolean, initial: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(initial);
  useEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize(Math.max(1, Math.round(Math.min(box.width, box.height))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);
  return [ref, size];
}

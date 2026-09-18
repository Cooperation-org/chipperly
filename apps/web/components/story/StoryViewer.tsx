'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SocialStory, StoryPage } from '@chipperly/shared/schemas/story';
import { useMediaUrl } from '@/lib/data/media';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import styles from './StoryViewer.module.css';

export interface StoryViewerProps {
  story: SocialStory;
  pages: StoryPage[];
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** S17: one page at a time, full screen. The hero picture resolves the same way `Picture` does
 * (`useMediaUrl`) but fills the top two-thirds of the card, which the fixed-size tile can't do. */
export function StoryViewer({ story, pages, onClose }: StoryViewerProps) {
  const [index, setIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const page = pages[index];
  const hasPage = page !== undefined;
  const photoUrl = useMediaUrl(page?.photo_id ?? null);
  const canReadAloud = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const goNext = useCallback(() => setIndex((i) => Math.min(pages.length - 1, i + 1)), [pages.length]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [index]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Guarded on `page` (not just called after the `if (!page) return null`
  // below): hooks always run regardless of that early return, so without
  // this guard a page-less render would still lock body scroll and steal
  // focus for a dialog that never actually mounts.
  useEffect(() => {
    if (!hasPage) return undefined;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowRight') {
        goNext();
        return;
      }
      if (e.key === 'ArrowLeft') {
        goPrev();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose, goNext, goPrev, hasPage]);

  function readAloud(): void {
    if (!page || !canReadAloud) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(page.text));
  }

  if (!page) return null;

  const content = (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={story.title} ref={panelRef} tabIndex={-1}>
      <IconButton icon="close" aria-label="Close story" variant="solid" className={styles.close} onClick={onClose} />

      <button
        type="button"
        className={styles.zoneLeft}
        onClick={goPrev}
        disabled={index === 0}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        className={styles.zoneRight}
        onClick={goNext}
        disabled={index === pages.length - 1}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className={styles.card}>
        <div className={styles.pictureBox}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API
            <img src={photoUrl} alt="" className={styles.photo} />
          ) : page.emoji ? (
            <span className={styles.emoji} aria-hidden="true">
              {page.emoji}
            </span>
          ) : null}
        </div>
        <p className={styles.text}>{page.text}</p>
      </div>

      <div className={styles.controls}>
        <IconButton icon="arrowLeft" aria-label="Previous page" onClick={goPrev} disabled={index === 0} />
        <span className={styles.dots} role="img" aria-live="polite" aria-label={`Page ${index + 1} of ${pages.length}`}>
          {pages.map((p, i) => (
            <span key={p.id} className={[styles.dot, i === index ? styles.dotActive : ''].filter(Boolean).join(' ')} />
          ))}
        </span>
        <IconButton icon="arrowRight" aria-label="Next page" onClick={goNext} disabled={index === pages.length - 1} />
      </div>

      {canReadAloud ? (
        <Button variant="secondary" onClick={readAloud} className={styles.readAloud}>
          Read aloud
        </Button>
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { StepNode } from '@/lib/data/schedule';
import { Picture } from '@/components/media/Picture';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { speak } from '@/lib/speech';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import styles from './VisualSchedule.module.css';

export interface VisualScheduleProps {
  title: string;
  picture: { emoji?: string | null; photo_id?: string | null };
  nodes: StepNode[];
  onToggle: (stepId: string, next: boolean) => void;
  onClose: () => void;
  /** No check circles are interactive; used for the activity editor's print preview, which has no real completions. */
  readOnly?: boolean;
  /** Shows the Print button; caregiver screens only, the child's view never prints. */
  printable?: boolean;
  /** Read-aloud (profile setting read_aloud): a speaker button per step. Saying "done" on a tick is the caller's `onToggle`. */
  readAloud?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * S36: "the steps are the only thing on the screen" — a full-screen, offline,
 * print-friendly list of one activity's (or one step's) steps. Portals
 * straight to `document.body` so `@media print` in VisualSchedule.module.css
 * can hide every other `body` child (the whole app shell) while this is the
 * one thing left showing, per docs/ux-plan.md section 12.
 */
export function VisualSchedule({ title, picture, nodes, onToggle, onClose, readOnly, printable, readAloud }: VisualScheduleProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Steps with sub-steps start closed and open on a tap; the print preview shows everything.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousTitle = document.title;
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-printing', 'true');
    document.title = title;

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
      document.documentElement.removeAttribute('data-printing');
      document.title = previousTitle;
      returnFocusRef.current?.focus();
    };
  }, [onClose, title]);

  function toggleOpen(id: string): void {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRow(node: StepNode, depth: number): ReactNode {
    const step = node.node.step;
    const hasChildren = node.children.length > 0;
    const open = readOnly || openIds.has(step.id);
    const body = (
      <>
        <Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name} size="child" />
        <span className={styles.rowName}>{step.name}</span>
      </>
    );
    return (
      <li key={step.id} className={styles.row} style={{ '--depth': depth } as CSSProperties}>
        <div className={styles.rowMain}>
          {readOnly ? (
            <span className={styles.rowTap}>{body}</span>
          ) : hasChildren ? (
            // A step with sub-steps: tapping the card opens them; the star still ticks the whole step.
            <button type="button" className={styles.rowTap} aria-expanded={open} onClick={() => toggleOpen(step.id)}>
              {body}
              <Icon name="chevron" size={28} className={[styles.chevron, open ? styles.chevronOpen : ''].filter(Boolean).join(' ')} />
            </button>
          ) : (
            // The whole card ticks the step (owner, 26 Sept: small circles take a child two or three tries).
            // Pointer-only: the star next to it is the one control screen readers and keyboards use.
            <button type="button" className={styles.rowTap} tabIndex={-1} aria-hidden="true" onClick={() => onToggle(step.id, !node.done)}>
              {body}
            </button>
          )}
          {readAloud && !readOnly ? (
            <IconButton icon="speaker" aria-label={`Say ${step.name}`} className={styles.check} onClick={() => speak(step.name)} />
          ) : null}
          <CheckCircle
            checked={node.done}
            onChange={readOnly ? undefined : (next) => onToggle(step.id, next)}
            disabled={readOnly}
            name={step.name}
            size="lg"
            className={styles.check}
          />
        </div>
        {hasChildren && open ? <ul className={styles.rows}>{node.children.map((child) => renderRow(child, depth + 1))}</ul> : null}
      </li>
    );
  }

  const content = (
    <div data-visual-schedule-root className={styles.overlay} role="dialog" aria-modal="true" aria-label={title} ref={panelRef} tabIndex={-1}>
      <div className={styles.chrome}>
        {printable ? <IconButton icon="print" aria-label="Print" variant="solid" onClick={() => window.print()} /> : null}
        <IconButton icon="close" aria-label="Close visual schedule" variant="solid" onClick={onClose} />
      </div>
      <header className={styles.header}>
        <Picture emoji={picture.emoji} photo_id={picture.photo_id} name={title} size="child" />
        <h1 className={styles.title}>{title}</h1>
      </header>
      <ul className={styles.rows}>{nodes.map((node) => renderRow(node, 0))}</ul>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

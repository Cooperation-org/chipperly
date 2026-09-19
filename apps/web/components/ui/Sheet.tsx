'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { IconButton } from './IconButton';
import { Button } from './Button';
import styles from './Sheet.module.css';

export interface SheetOpts {
  title?: string;
  onClose?: () => void;
}

interface SheetEntry {
  content: ReactNode;
  opts?: SheetOpts;
}

// Module-level stack: SheetHost is mounted once, useSheet() everywhere else
// just reads/pushes onto this. open() pushes, back() pops, only the top renders.
let stack: SheetEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return stack;
}

function getServerSnapshot() {
  return stack;
}

function open(content: ReactNode, opts?: SheetOpts) {
  stack = [...stack, { content, opts }];
  emit();
}

function replace(content: ReactNode, opts?: SheetOpts) {
  if (stack.length === 0) {
    open(content, opts);
    return;
  }
  stack = [...stack.slice(0, -1), { content, opts }];
  emit();
}

function close() {
  const top = stack[stack.length - 1];
  stack = [];
  emit();
  top?.opts?.onClose?.();
}

function back() {
  if (stack.length <= 1) {
    close();
    return;
  }
  stack = stack.slice(0, -1);
  emit();
}

export interface UseSheetResult {
  open: typeof open;
  replace: typeof replace;
  back: typeof back;
  close: typeof close;
  isOpen: boolean;
}

export function useSheet(): UseSheetResult {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { open, replace, back, close, isOpen: entries.length > 0 };
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Mounted once near the app root. Renders whatever is on top of the sheet stack. */
export function SheetHost() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ startY: number; delta: number; active: boolean }>({ startY: 0, delta: 0, active: false });

  const top = entries[entries.length - 1];
  const isOpen = entries.length > 0;

  useEffect(() => {
    if (!isOpen) return undefined;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
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
  }, [isOpen]);

  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: e.clientY, delta: 0, active: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onHandlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !panelRef.current) return;
    const delta = Math.max(0, e.clientY - dragRef.current.startY);
    dragRef.current.delta = delta;
    panelRef.current.style.transform = `translateY(${delta}px)`;
  }, []);

  const onHandlePointerUp = useCallback(() => {
    const { delta, active } = dragRef.current;
    dragRef.current.active = false;
    if (!active || !panelRef.current) return;
    panelRef.current.style.transform = '';
    if (delta > 120) {
      close();
    }
  }, []);

  if (!isOpen || !top) return null;

  return (
    <div className={[styles.overlay, styles.visible].join(' ')} onClick={() => close()}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={top.opts?.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={styles.handleRow}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className={styles.handle} aria-hidden="true" />
        </div>
        {top.opts?.title ? (
          <div className={styles.header}>
            <h2 className={styles.title}>{top.opts.title}</h2>
            <IconButton icon="close" aria-label="Close" onClick={() => close()} />
          </div>
        ) : (
          <div className={styles.header}>
            <span />
            <IconButton icon="close" aria-label="Close" onClick={() => close()} />
          </div>
        )}
        <div className={styles.body}>{top.content}</div>
      </div>
    </div>
  );
}

export interface ConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  /** Defaults to "Cancel"; a redeem confirm reads "Not now" instead (ux-plan EI 6). */
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Content component for the confirm-sheet pattern: delete profile, remove member, etc. */
export function Confirm({ title, body, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div>
      <h3 className={styles.confirmTitle}>{title}</h3>
      <p className={styles.confirmBody}>{body}</p>
      <div className={styles.confirmActions}>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

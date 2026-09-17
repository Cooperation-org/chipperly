'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import { api } from '@/lib/api/client';
import { unlock, usePinGate } from '@/lib/device/settings';
import { verifyPin } from '@/lib/auth/pin';
import { PinPad } from '@/components/pin/PinPad';
import { IconButton } from '@/components/ui/IconButton';
import styles from './UnlockOverlay.module.css';

export interface UnlockOverlayProps {
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * S24: the full-screen PIN overlay opened from the child header's lock
 * glyph. Verifies against the cached hash in `useSession().user.pin_hash`
 * (works offline, CONTRACTS.md "PIN"); `usePinGate` enforces the five
 * wrong attempts / thirty second wait rule and survives a reload.
 */
export function UnlockOverlay({ onClose }: UnlockOverlayProps) {
  const router = useRouter();
  const { user } = useSession();
  const pinGate = usePinGate();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [wrongMessage, setWrongMessage] = useState<string | undefined>();

  useEffect(() => {
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
  }, [onClose]);

  async function handleComplete(pin: string): Promise<boolean> {
    if (pinGate.locked) return false;

    const hash = user?.pin_hash;
    if (!hash) {
      setWrongMessage('No PIN is set for this account.');
      return false;
    }

    const ok = await verifyPin(pin, hash);
    if (!ok) {
      await pinGate.recordFailure();
      setWrongMessage('Wrong PIN. Try again.');
      return false;
    }

    await pinGate.recordSuccess();
    try {
      // The server only ever lifts sync/push's lock gate once it has
      // checked this PIN itself (CONTRACTS.md "Sync authorization");
      // ponytail: offline/unreachable, still unlock the local view below
      // (S24 "works offline against the locally cached hash") -- writes
      // made before the server catches up stay lock-gated, which fails
      // safe rather than open.
      await api.post('/me/unlock', { pin });
    } catch {
      // see above
    }
    await unlock();
    router.replace('/today/');
    return true;
  }

  const waitSeconds = Math.ceil(pinGate.remaining_ms / 1000);
  const message = pinGate.locked ? `Too many tries. Wait ${waitSeconds}s.` : wrongMessage;

  const content = (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Unlock" ref={panelRef} tabIndex={-1}>
      <IconButton icon="close" aria-label="Cancel unlock" variant="solid" className={styles.close} onClick={onClose} />
      <PinPad title="Caregiver PIN" onComplete={handleComplete} error={message} />
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

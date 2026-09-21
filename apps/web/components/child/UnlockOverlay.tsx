'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession, signInWithPassword } from '@/lib/auth/session';
import { ApiError, api } from '@/lib/api/client';
import { unlock, usePinGate, enterParentMode } from '@/lib/device/settings';
import { verifyPin } from '@/lib/auth/pin';
import Kiosk from '@/lib/native/kiosk';
import { PinPad } from '@/components/pin/PinPad';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import styles from './UnlockOverlay.module.css';

export interface UnlockOverlayProps {
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * S24 + the app's default-to-child-view gate (lib/device/settings.ts's
 * useParentMode): the full-screen overlay opened from the child header's
 * lock glyph, the only way into caregiver screens. PIN mode verifies
 * against the cached hash in `useSession().user.pin_hash` (works offline,
 * CONTRACTS.md "PIN"); `usePinGate` enforces the five wrong attempts /
 * thirty second wait rule and survives a reload. An account with no PIN
 * set yet has nothing to check a PIN against, so it starts in password
 * mode instead (re-entering the account's email/password) -- either path
 * ends the same way: exit any hard lock, mark this device's caregiver
 * mode entered, and go to Today.
 */
export function UnlockOverlay({ onClose }: UnlockOverlayProps) {
  const router = useRouter();
  const { user } = useSession();
  const pinGate = usePinGate();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [wrongMessage, setWrongMessage] = useState<string | undefined>();
  const [mode, setMode] = useState<'pin' | 'password'>(user?.pin_hash ? 'pin' : 'password');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);

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

  /** Common ending for either verification path: drop any hard lock, enter caregiver mode, go to Today. */
  async function finishUnlock(): Promise<void> {
    await Kiosk.exitFocusMode();
    await unlock();
    await enterParentMode();
    router.replace('/today/');
  }

  async function handlePinComplete(pin: string): Promise<boolean> {
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
    await finishUnlock();
    return true;
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!user?.email) return;
    setVerifying(true);
    setPasswordError(undefined);
    try {
      // A fresh login proves identity server-side on its own (a new
      // session starts with no lock gate), unlike the PIN path there's no
      // separate /me/unlock call to make.
      await signInWithPassword(user.email, password);
      await finishUnlock();
    } catch (err) {
      setPasswordError(err instanceof ApiError ? 'Wrong password. Try again.' : "Couldn't verify. Try again.");
      setPassword('');
    } finally {
      setVerifying(false);
    }
  }

  const waitSeconds = Math.ceil(pinGate.remaining_ms / 1000);
  const pinMessage = pinGate.locked ? `Too many tries. Wait ${waitSeconds}s.` : wrongMessage;
  const canUsePin = Boolean(user?.pin_hash);

  const content = (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Unlock" ref={panelRef} tabIndex={-1}>
      <IconButton icon="close" aria-label="Cancel unlock" variant="solid" className={styles.close} onClick={onClose} />
      {mode === 'pin' ? (
        <>
          <PinPad title="Caregiver PIN" onComplete={handlePinComplete} error={pinMessage} />
          <button type="button" className={styles.switchMode} onClick={() => setMode('password')}>
            Use my password instead
          </button>
        </>
      ) : (
        <form className={styles.passwordForm} onSubmit={(e) => void handlePasswordSubmit(e)}>
          <p className={styles.passwordTitle}>Caregiver password</p>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
          />
          <Button type="submit" fullWidth loading={verifying}>
            Unlock
          </Button>
          {canUsePin ? (
            <button type="button" className={styles.switchMode} onClick={() => setMode('pin')}>
              Use my PIN instead
            </button>
          ) : null}
        </form>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

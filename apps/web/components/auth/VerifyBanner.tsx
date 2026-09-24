'use client';

import { useState } from 'react';
import { refreshMe, useSession } from '@/lib/auth/session';
import { api, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import styles from './VerifyBanner.module.css';

const DISMISS_KEY = 'verify_banner_dismissed';

interface ResendResponse {
  sent: boolean;
  already_verified?: boolean;
  /** Epoch ms when another email is allowed (one a day, the life of a link). */
  retry_at?: number;
}

/** "at 3:40 PM", or "tomorrow at 3:40 PM" when the next send is after midnight. */
function whenAllowed(retryAt: number): string {
  const at = new Date(retryAt);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString() ? `at ${time}` : `tomorrow at ${time}`;
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Quiet, dismissible reminder for an unverified email, meant to be placed on
 * Today (S2: verification is never a blocking screen). Dismissal only lasts
 * the tab session; it reappears next visit until the address is verified.
 */
export function VerifyBanner() {
  const { user } = useSession();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!user || user.email_verified_at !== null || dismissed) return null;

  function dismiss(): void {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sessionStorage unavailable (private window, blocked storage): the
      // banner still dismisses for this render, just not across a reload.
    }
  }

  async function resend(): Promise<void> {
    setSending(true);
    try {
      const res = await api.post<ResendResponse>('/me/verify-email');
      if (res.already_verified) {
        await refreshMe();
      } else if (res.sent) {
        setNote(`Sent to ${user?.email}. The link works for 24 hours.`);
      } else if (res.retry_at) {
        setNote(`An email already went out today. You can send another ${whenAllowed(res.retry_at)}.`);
      }
    } catch (err) {
      setNote(err instanceof ApiError && err.message ? err.message : "Couldn't send the email. Try again soon.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>{note ?? 'Check your email to verify your address.'}</p>
      <Button variant="secondary" loading={sending} disabled={sending} onClick={() => void resend()}>
        Resend email
      </Button>
      <IconButton icon="close" aria-label="Dismiss" onClick={dismiss} />
    </div>
  );
}

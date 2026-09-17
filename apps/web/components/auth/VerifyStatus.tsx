'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { refreshMe, useSession } from '@/lib/auth/session';
import styles from './VerifyStatus.module.css';

type Status = 'checking' | 'verified' | 'expired';

/** /verify/?token= : calls GET /auth/verify/:token on mount (page wraps this in Suspense). */
export function VerifyStatus() {
  const token = useSearchParams().get('token') ?? '';
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState<Status>(() => (token ? 'checking' : 'expired'));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .get(`/auth/verify/${encodeURIComponent(token)}`)
      .then(async () => {
        if (cancelled) return;
        setStatus('verified');
        try {
          await refreshMe();
        } catch {
          // Signed out, or offline: the banner will just re-check on the next sign-in.
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('expired');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const destination = sessionStatus === 'signed_in' ? '/today/' : '/';
  const destinationLabel = sessionStatus === 'signed_in' ? 'Go to Today' : 'Sign in';

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>
        {status === 'checking' ? 'Verifying…' : status === 'verified' ? 'Email verified' : 'This link has expired'}
      </h1>
      {status === 'expired' ? <p className={styles.text}>Ask for a new verification email from Settings.</p> : null}
      {status !== 'checking' ? (
        <Link href={destination} className={styles.link}>
          {destinationLabel}
        </Link>
      ) : null}
    </div>
  );
}

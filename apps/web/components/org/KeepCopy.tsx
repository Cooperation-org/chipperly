'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Handover, HandoverAcceptResponse } from '@chipperly/shared/schemas/handover';
import { api, ApiError, TimeoutError, TIMEOUT_MESSAGE } from '@/lib/api/client';
import { refreshMe, useSession } from '@/lib/auth/session';
import { useActiveAccount, useActiveProfile } from '@/lib/profile/active';
import { startSync } from '@/lib/sync/engine';
import { BigButton } from '@/components/ui/BigButton';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { AppleButton } from '@/components/auth/AppleButton';
import { setPostAuthRedirect } from '@/components/auth/postAuthRedirect';
import styles from '@/components/auth/InviteAccept.module.css';

type LoadState = { status: 'loading' } | { status: 'gone'; message: string } | { status: 'ready'; offer: Handover };

const GONE: Record<string, string> = {
  handover_used: 'This link was already used. Your copy is in your account.',
  handover_expired: 'This link has expired. Ask the organization to send a new one.',
  handover_inactive: 'This organization covers this person again, so there is nothing to keep.',
};

/**
 * "Keep {name}'s Chipperly": opened from the emailed link (?token=) or the in-app banner (?id=).
 * Signed out, it asks to sign in or sign up with the email the link was sent to, then comes back here.
 */
export function KeepCopy() {
  const params = useSearchParams();
  const key = params.get('token') ?? params.get('id') ?? '';
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { setActiveAccountId } = useActiveAccount();
  const { setActiveProfileId } = useActiveProfile();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/keep/?${params.get('token') ? 'token' : 'id'}=${encodeURIComponent(key)}`;

  useEffect(() => {
    if (sessionStatus === 'signed_out' && key) void setPostAuthRedirect(back);
  }, [sessionStatus, key, back]);

  useEffect(() => {
    if (sessionStatus !== 'signed_in' || !key) return;
    let cancelled = false;
    void api
      .get<Handover>(`/handovers/${encodeURIComponent(key)}`)
      .then((offer) => {
        if (!cancelled) setState({ status: 'ready', offer });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = err instanceof ApiError ? err.code : '';
        setState({ status: 'gone', message: GONE[code] ?? 'This link is not valid for this account. Sign in with the email it was sent to.' });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, key]);

  async function keep(): Promise<void> {
    setWorking(true);
    setError(null);
    try {
      const result = await api.post<HandoverAcceptResponse>(`/handovers/${encodeURIComponent(key)}/accept`);
      await refreshMe().catch(() => undefined);
      setActiveAccountId(result.account_id);
      setActiveProfileId(result.profile_id);
      startSync();
      router.push('/today/');
    } catch (err) {
      setError(err instanceof TimeoutError ? TIMEOUT_MESSAGE : "Couldn't make the copy. Try again.");
      setWorking(false);
    }
  }

  if (!key) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Link not found</h1>
        <p className={styles.text}>This link is not valid. Ask the organization to send a new one.</p>
      </div>
    );
  }

  if (sessionStatus === 'signed_out') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Keep a copy in your own account</h1>
        <p className={styles.text}>Sign in or create an account with the email this link was sent to.</p>
        <div className={styles.auth}>
          <GoogleButton consented />
          <AppleButton consented />
          <div className={styles.divider}>or</div>
          <div className={styles.authLinks}>
            <Link href="/sign-up/" className={styles.link}>
              Create account
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/" className={styles.link}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') return null;

  if (state.status === 'gone') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Nothing to keep here</h1>
        <p className={styles.text}>{state.message}</p>
      </div>
    );
  }

  const { offer } = state;
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Keep {offer.profile_name}&apos;s Chipperly</h1>
      <p className={styles.text}>
        {offer.org_name} no longer covers {offer.profile_name}. You can keep a copy in your own account, with routines, rewards, chips, stories and pictures. It starts with a free trial.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <BigButton fullWidth disabled={working} onClick={() => void keep()}>
        {working ? 'Making your copy…' : `Keep ${offer.profile_name}'s Chipperly`}
      </BigButton>
    </div>
  );
}

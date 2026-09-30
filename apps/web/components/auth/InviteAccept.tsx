'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { InviteDetails, AcceptInviteResponse } from '@chipperly/shared/schemas/account';
import { api } from '@/lib/api/client';
import { refreshMe, useSession } from '@/lib/auth/session';
import { useActiveAccount, useActiveProfile } from '@/lib/profile/active';
import { startSync } from '@/lib/sync/engine';
import { enterParentMode } from '@/lib/device/settings';
import { asksDeviceRole, setDeviceRole } from '@/lib/device/role';
import { BigButton } from '@/components/ui/BigButton';
import { PictureTile } from '@/components/ui/PictureTile';
import { GoogleButton } from './GoogleButton';
import { AppleButton } from './AppleButton';
import { setPostAuthRedirect } from './postAuthRedirect';
import styles from './InviteAccept.module.css';

type LoadState = { status: 'loading' } | { status: 'not_found' } | { status: 'ready'; invite: InviteDetails };

/** The account is auto-named after its owner, so "Sam invited you to Sam" reads oddly: name the profiles instead. */
function headline({ inviter_name, account_name, profiles }: InviteDetails): string {
  const names = profiles.map((p) => p.name);
  if (names.length > 0 && inviter_name === account_name) {
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `${inviter_name} invited you to help with ${list}`;
  }
  return inviter_name === account_name ? `${inviter_name} invited you to Chipperly` : `${inviter_name} invited you to ${account_name}`;
}

/** S33: accept invite. Reads the token via useSearchParams (page wraps this in Suspense). */
export function InviteAccept() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { setActiveAccountId } = useActiveAccount();
  const { setActiveProfileId } = useActiveProfile();
  const [state, setState] = useState<LoadState>(() => (token ? { status: 'loading' } : { status: 'not_found' }));
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .get<InviteDetails>(`/invites/${encodeURIComponent(token)}`)
      .then((invite) => {
        if (!cancelled) setState({ status: 'ready', invite });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'not_found' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // So S1/S2 send a signed-out visitor back here once they've signed in.
  useEffect(() => {
    if (state.status !== 'ready' || state.invite.expired || sessionStatus !== 'signed_out' || !token) return;
    void setPostAuthRedirect(`/invite/?token=${encodeURIComponent(token)}`);
  }, [state, sessionStatus, token]);

  async function accept(): Promise<void> {
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await api.post<AcceptInviteResponse>(`/invites/${encodeURIComponent(token)}/accept`);
      await refreshMe();
      setActiveAccountId(result.account_id);
      if (result.profile_ids[0]) setActiveProfileId(result.profile_ids[0]);
      // They signed in here to manage a child's schedule, so this is a caregiver device
      // (otherwise they land in the child view); the app asks who uses the device first.
      if (asksDeviceRole()) {
        router.push('/onboarding/device/');
        return;
      }
      startSync();
      await setDeviceRole({ kind: 'caregiver' });
      await enterParentMode();
      router.push('/today/');
    } catch {
      setAcceptError("Couldn't accept the invite. Try again.");
      setAccepting(false);
    }
  }

  if (state.status === 'loading') return null;

  if (state.status === 'not_found') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Invite not found</h1>
        <p className={styles.text}>This invite link isn&apos;t valid. Ask for a new invite.</p>
      </div>
    );
  }

  const { invite } = state;

  if (invite.expired) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>This invite has expired</h1>
        <p className={styles.text}>Ask {invite.inviter_name} for a new invite.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>
        {headline(invite)}
      </h1>
      <p className={styles.text}>
        As {invite.role === 'admin' ? 'an admin' : 'a team member'} you&apos;ll see the schedule, chips and stories for:
      </p>
      <div className={styles.profiles}>
        {invite.profiles.map((profile) => (
          <div key={profile.id} className={styles.profile}>
            <PictureTile emoji={profile.avatar_emoji ?? undefined} name={profile.name} size="grid" />
            <span className={styles.profileName}>{profile.name}</span>
          </div>
        ))}
      </div>
      {sessionStatus === 'signed_in' ? (
        <>
          {acceptError ? (
            <p className={styles.error} role="alert">
              {acceptError}
            </p>
          ) : null}
          <BigButton fullWidth disabled={accepting} onClick={() => void accept()}>
            {accepting ? 'Accepting…' : 'Accept invite'}
          </BigButton>
        </>
      ) : (
        <div className={styles.auth}>
          {/* No consent checkbox on this screen (S33); same treatment as S1 -- see components/auth/GoogleButton.tsx. */}
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
      )}
    </div>
  );
}

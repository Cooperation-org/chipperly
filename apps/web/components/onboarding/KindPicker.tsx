'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Account, AccountKind, Role } from '@chipperly/shared/schemas/account';
import { api } from '@/lib/api/client';
import { refreshMe, useSession } from '@/lib/auth/session';
import { useActiveAccount } from '@/lib/profile/active';
import { PictureTile } from '@/components/ui/PictureTile';
import styles from './KindPicker.module.css';

interface KindOption {
  kind: AccountKind;
  emoji: string;
  label: string;
  description: string;
}

const OPTIONS: KindOption[] = [
  { kind: 'individual', emoji: '🙂', label: 'Myself', description: "I'll use the tools for my own day." },
  { kind: 'household', emoji: '👪', label: 'My family', description: 'Your child or children at home, or everyone in the house.' },
  { kind: 'supported', emoji: '🤝', label: 'Someone I support', description: 'One person you help, like a client or a relative.' },
  { kind: 'agency', emoji: '🏢', label: 'My organization', description: 'A therapy practice, school or support team with clients and staff.' },
];

interface CreateAccountResponse {
  account: Account;
  role: Role;
}

/**
 * S3: who is Chipperly for. Tapping a tile creates the account and, for "Myself", the profile too.
 * `?another` is Settings' "Start another account": someone who already has people starts a separate account.
 */
export function KindPicker() {
  const router = useRouter();
  const another = useSearchParams().has('another');
  const { status, user, profiles } = useSession();
  const { setActiveAccountId } = useActiveAccount();
  const [busy, setBusy] = useState<AccountKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Same reasoning as ChildShell's mirror-image guard: only act on
    // `profiles` once `status` has actually settled to signed_in, so a
    // 'loading' or momentarily-signed_out read doesn't get treated as
    // "still needs onboarding" and bounced back here right after
    // ChildShell already bounced away from it.
    if (!another && status === 'signed_in' && profiles.length > 0) router.replace('/child/');
  }, [another, status, profiles, router]);

  if (!another && status === 'signed_in' && profiles.length > 0) return null;

  async function choose(kind: AccountKind): Promise<void> {
    if (!user || busy) return;
    setBusy(kind);
    setError(null);
    try {
      // 'supported' is named for the person being supported, and their name is only
      // asked for on the next screen, so the account gets a neutral label until then.
      const accountNames: Partial<Record<AccountKind, string>> = {
        agency: 'My organization',
        supported: 'Someone I support',
      };
      const name = accountNames[kind] ?? user.display_name;
      const { account } = await api.post<CreateAccountResponse>('/accounts', { kind, name });
      await refreshMe();
      setActiveAccountId(account.id);

      // Organizations have their own six-step setup. Every other kind continues to S4:
      // "Myself" skips the name form there and goes straight to the setup interview.
      router.push(kind === 'agency' ? '/onboarding/org/' : '/onboarding/profile/');
    } catch {
      setError("Couldn't set that up. Try again.");
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Who is Chipperly for?</h1>
      <p className={styles.subtitle}>{another ? 'This starts a separate account, with its own people and plan.' : 'You can add more people later.'}</p>
      <div className={styles.grid}>
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={styles.tile}
            disabled={busy !== null}
            aria-busy={busy === option.kind}
            onClick={() => void choose(option.kind)}
          >
            <PictureTile emoji={option.emoji} name={option.label} size="grid" />
            <span className={styles.label}>{option.label}</span>
            <span className={styles.description}>{option.description}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {another ? (
        <Link href="/settings/account/" className={styles.cancel}>
          Cancel
        </Link>
      ) : null}
    </div>
  );
}

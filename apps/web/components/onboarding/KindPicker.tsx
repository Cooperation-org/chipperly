'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Account, AccountKind, Role } from '@chipperly/shared/schemas/account';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { api } from '@/lib/api/client';
import { refreshMe, useSession } from '@/lib/auth/session';
import { useActiveAccount, useActiveProfile } from '@/lib/profile/active';
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
  { kind: 'household', emoji: '👪', label: 'My family', description: 'One or more children at home.' },
  { kind: 'agency', emoji: '🏢', label: 'My organization', description: 'Clients and staff.' },
];

interface CreateAccountResponse {
  account: Account;
  role: Role;
}

/** S3: who is Chipperly for. Tapping a tile creates the account and, for "Myself", the profile too. */
export function KindPicker() {
  const router = useRouter();
  const { user, profiles } = useSession();
  const { setActiveAccountId } = useActiveAccount();
  const { setActiveProfileId } = useActiveProfile();
  const [busy, setBusy] = useState<AccountKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profiles.length > 0) router.replace('/today/');
  }, [profiles, router]);

  if (profiles.length > 0) return null;

  async function choose(kind: AccountKind): Promise<void> {
    if (!user || busy) return;
    setBusy(kind);
    setError(null);
    try {
      const name = kind === 'agency' ? 'My organization' : user.display_name;
      const { account } = await api.post<CreateAccountResponse>('/accounts', { kind, name });
      await refreshMe();
      setActiveAccountId(account.id);

      if (kind === 'individual') {
        const profile = await api.post<Profile>(`/accounts/${account.id}/profiles`, {
          name: user.display_name,
          emoji: '🙂',
        });
        await refreshMe();
        setActiveProfileId(profile.id);
        router.push('/onboarding/ready/');
      } else {
        router.push('/onboarding/profile/');
      }
    } catch {
      setError("Couldn't set that up. Try again.");
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Who is Chipperly for?</h1>
      <p className={styles.subtitle}>You can add more people later.</p>
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
    </div>
  );
}

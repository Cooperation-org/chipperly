'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExportResponseSchema, type ExportResponse } from '@chipperly/shared/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { PinPad } from '@/components/pin/PinPad';
import { api } from '@/lib/api/client';
import { useSession, signOut, setPin } from '@/lib/auth/session';
import { useActiveProfile, useActiveAccount } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import styles from './AccountScreen.module.css';

function ChangePasswordSheet({ email }: { email: string }) {
  return (
    <div className={styles.sheet}>
      <p className={styles.hint}>
        We don&apos;t ask for your current password here. Use the reset-password email instead.
      </p>
      <Link href={`/forgot-password/?email=${encodeURIComponent(email)}`}>
        <Button variant="primary" fullWidth>
          Send reset email
        </Button>
      </Link>
    </div>
  );
}

function DevicePinSheet({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | undefined>();
  async function handleComplete(pin: string): Promise<boolean> {
    try {
      await setPin(pin);
      toast('PIN updated');
      onDone();
      return true;
    } catch {
      setError("Couldn't save the PIN. Try again.");
      return false;
    }
  }
  return <PinPad title="Set a new device PIN" error={error} onComplete={handleComplete} />;
}

/** S30: account details, sign-in, PIN, switch account, sign out, delete. */
export function AccountScreen() {
  const router = useRouter();
  const { open, close } = useSheet();
  const { user, accounts } = useSession();
  const { profiles, setActiveProfileId } = useActiveProfile();
  const { setActiveAccountId } = useActiveAccount();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!user) return null;

  const provider = user?.auth_provider ?? null;

  function handleSwitchAccount(accountId: string): void {
    setActiveAccountId(accountId);
    const firstProfile = profiles.find((p) => p.account_id === accountId);
    if (firstProfile) setActiveProfileId(firstProfile.id);
    close();
    router.push('/today/');
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace('/');
  }

  /** "Download my data" (SOW Q21): fetches GET /me/export and saves it as one JSON file. */
  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const data = await api.get<ExportResponse>('/me/export', { schema: ExportResponseSchema });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chipperly-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Couldn't download your data. Try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    try {
      await api.delete('/me');
      await signOut();
      toast('Account deleted');
      router.replace('/');
    } catch {
      toast("Couldn't delete your account. Try again.");
    } finally {
      setDeleting(false);
      close();
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <span className={styles.fieldValue}>{user.display_name}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Email</span>
          <span className={styles.fieldValue}>{user.email}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Sign-in</span>
          <span className={styles.fieldValue}>
            {provider === 'google' ? 'Google connected' : provider === 'apple' ? 'Apple connected' : 'Email and password'}
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <ListRow
          tile={<Icon name="lock" size={20} />}
          name="Change password"
          trailing={<Icon name="chevron" size={20} />}
          onTap={() => open(<ChangePasswordSheet email={user.email} />, { title: 'Change password' })}
        />
        <ListRow
          tile={<Icon name="lock" size={20} />}
          name={user.pin_hash ? 'Change device PIN' : 'Set device PIN'}
          trailing={<Icon name="chevron" size={20} />}
          onTap={() => open(<DevicePinSheet onDone={close} />, { title: 'Device PIN' })}
        />
        {accounts.length > 1 ? (
          <ListRow
            tile={<Icon name="users" size={20} />}
            name="Switch account"
            trailing={<Icon name="chevron" size={20} />}
            onTap={() =>
              open(
                <div className={styles.sheet}>
                  {accounts.map((a) => (
                    <button key={a.account.id} type="button" className={styles.accountRow} onClick={() => handleSwitchAccount(a.account.id)}>
                      {a.account.name}
                    </button>
                  ))}
                </div>,
                { title: 'Switch account' },
              )
            }
          />
        ) : null}
        <ListRow
          tile={<Icon name="share" size={20} />}
          name="Download my data"
          secondary={exporting ? 'Preparing your file…' : undefined}
          trailing={<Icon name="chevron" size={20} />}
          onTap={() => void handleExport()}
        />
        <ListRow
          tile={<Icon name="arrowRight" size={20} />}
          name="Sign out"
          trailing={<Icon name="chevron" size={20} />}
          onTap={() => void handleSignOut()}
        />
      </div>

      <p className={styles.legalLinks}>
        <Link href="/privacy/">Privacy policy</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms/">Terms</Link>
      </p>

      <Button
        variant="danger"
        fullWidth
        loading={deleting}
        onClick={() =>
          open(
            <Confirm
              title="Delete account"
              body="This deletes your sign-in. Any household or agency profiles stay with the account's other admins."
              confirmLabel="Delete account"
              danger
              onConfirm={() => void handleDelete()}
              onCancel={close}
            />,
          )
        }
      >
        Delete account
      </Button>
    </div>
  );
}

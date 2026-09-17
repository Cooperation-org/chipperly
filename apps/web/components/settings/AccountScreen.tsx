'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { PinPad } from '@/components/pin/PinPad';
import { api, ApiError } from '@/lib/api/client';
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

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    try {
      await api.delete('/me');
      await signOut();
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast('Contact support to delete your account.');
      } else {
        toast("Couldn't delete your account. Try again.");
      }
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

      <div className={styles.actions}>
        <button type="button" className={styles.actionRow} onClick={() => open(<ChangePasswordSheet email={user.email} />, { title: 'Change password' })}>
          Change password
        </button>
        <button
          type="button"
          className={styles.actionRow}
          onClick={() => open(<DevicePinSheet onDone={close} />, { title: 'Device PIN' })}
        >
          {user.pin_hash ? 'Change device PIN' : 'Set device PIN'}
        </button>
        {accounts.length > 1 ? (
          <button
            type="button"
            className={styles.actionRow}
            onClick={() =>
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
          >
            Switch account
          </button>
        ) : null}
        <button type="button" className={styles.actionRow} onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </div>

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

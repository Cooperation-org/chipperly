'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, getTokens, ApiError } from '@/lib/api/client';
import { refreshMe } from '@/lib/auth/session';
import { tempPasswordError } from '@/lib/setupFlow';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { redirectAfterAuth } from './postAuthRedirect';
import styles from './ResetPasswordForm.module.css';

/**
 * /change-password/: first sign-in with a temporary password. The server refuses everything else
 * (403 must_change_password) until a new password is set here, so this is the only screen that works.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nobody signed in here: nothing to change.
  useEffect(() => {
    void getTokens().then((t) => {
      if (!t?.access_token) router.replace('/');
    });
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const tooShort = tempPasswordError(password);
    if (tooShort) return setError(tooShort);
    if (password !== confirm) return setError("Those passwords don't match.");
    setLoading(true);
    try {
      await api.post('/me/change-password', { password });
      await refreshMe();
      await redirectAfterAuth(router);
    } catch (err) {
      setError(err instanceof ApiError ? "Couldn't save the new password. Try again." : "Couldn't save the new password. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Choose your own password</h1>
      <p className={styles.success}>The password you signed in with was temporary. Pick one only you know.</p>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField label="Confirm password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth loading={loading}>
          Save and continue
        </Button>
      </form>
    </div>
  );
}

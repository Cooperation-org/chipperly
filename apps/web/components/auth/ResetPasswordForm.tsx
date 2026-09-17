'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import styles from './ResetPasswordForm.module.css';

/** /reset-password/?token= : set a new password. Reads the token via useSearchParams (page wraps this in Suspense). */
export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password/reset', { token, password });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_token'
          ? 'This link has expired. Ask for a new one.'
          : "Couldn't reset your password. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div>
        <h1 className={styles.title}>Password reset</h1>
        <p className={styles.success}>Your password has been changed.</p>
        <p className={styles.footer}>
          <Link href="/" className={styles.link}>
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.title}>Reset password</h1>
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
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth loading={loading} disabled={!token}>
          Reset
        </Button>
      </form>
      <p className={styles.footer}>
        <Link href="/" className={styles.link}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import styles from './ForgotPasswordForm.module.css';

/** /forgot-password/: request a reset link. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/password/forgot', { email });
      setSent(true);
    } catch {
      setError("Couldn't send that. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div>
        <h1 className={styles.title}>Check your email</h1>
        <p className={styles.success}>If that address has an account, a reset link is on its way.</p>
        <p className={styles.footer}>
          <Link href="/" className={styles.link}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.title}>Forgot password</h1>
      <p className={styles.hint}>Enter your email and we&apos;ll send a link to reset it.</p>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth loading={loading}>
          Send link
        </Button>
      </form>
      <p className={styles.footer}>
        <Link href="/" className={styles.link}>
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

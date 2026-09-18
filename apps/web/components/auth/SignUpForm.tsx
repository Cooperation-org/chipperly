'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp, useSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { GoogleButton } from './GoogleButton';
import { AppleButton } from './AppleButton';
import { getAuthProviders } from './providers';
import { getPendingInviteToken, redirectAfterAuth } from './postAuthRedirect';
import styles from './SignUpForm.module.css';

const HAS_OAUTH = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) || Boolean(process.env.NEXT_PUBLIC_APPLE_CLIENT_ID);

/** S2: create account. */
export function SignUpForm() {
  const { status } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeRequired, setInviteCodeRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'signed_in') router.replace('/today/');
  }, [status, router]);

  useEffect(() => {
    void getAuthProviders().then((providers) => setInviteCodeRequired(providers.invite_code_required));
  }, []);

  if (status === 'signed_in') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const invite_token = (await getPendingInviteToken()) ?? undefined;
      await signUp(email, password, name, { invite_code: inviteCode || undefined, invite_token });
      await redirectAfterAuth(router);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'email_taken'
          ? 'An account with this email already exists.'
          : err instanceof ApiError && err.code === 'invite_code_invalid'
            ? err.message
            : "Couldn't create your account. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Create account</h1>
      {HAS_OAUTH ? (
        <div className={styles.form}>
          <GoogleButton />
          <AppleButton />
          <div className={styles.divider}>or</div>
        </div>
      ) : null}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <TextField label="Name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {inviteCodeRequired ? (
          <TextField
            label="Beta invite code"
            placeholder="Ask Chipperly for the code"
            autoComplete="off"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth loading={loading}>
          Create account
        </Button>
      </form>
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link href="/" className={styles.link}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

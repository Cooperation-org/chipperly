'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithPassword, useSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { GoogleButton } from './GoogleButton';
import { AppleButton } from './AppleButton';
import { redirectAfterAuth } from './postAuthRedirect';
import styles from './SignInForm.module.css';

const HAS_OAUTH = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) || Boolean(process.env.NEXT_PUBLIC_APPLE_CLIENT_ID);

/** S1: welcome / sign in. */
export function SignInForm() {
  const { status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // See SignUpForm's identical guard: without it this effect's own
  // router.replace('/child/') races redirectAfterAuth's destination.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (status === 'signed_in' && !submittingRef.current) router.replace('/child/');
  }, [status, router]);

  if (status === 'signed_in') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    submittingRef.current = true;
    try {
      await signInWithPassword(email, password);
      await redirectAfterAuth(router);
    } catch (err) {
      setError(err instanceof ApiError ? "Couldn't sign in. Check your email and password." : "Couldn't sign in. Try again.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <div>
      <h1 className={styles.wordmark}>Chipperly</h1>
      <p className={styles.subtitle}>Neurodivergent life made easier.</p>
      {HAS_OAUTH ? (
        <div className={styles.form}>
          {/* Existing users only: no consent checkbox on this screen, see components/auth/GoogleButton.tsx. */}
          <GoogleButton consented />
          <AppleButton consented />
          <div className={styles.divider}>or</div>
        </div>
      ) : null}
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
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth loading={loading}>
          Sign in
        </Button>
      </form>
      <div className={styles.links}>
        <Link href="/sign-up/" className={styles.link}>
          Create account
        </Link>
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <Link href="/forgot-password/" className={styles.link}>
          Forgot password
        </Link>
      </div>
    </div>
  );
}

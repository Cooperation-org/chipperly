'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp, useSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { GoogleButton } from './GoogleButton';
import { AppleButton } from './AppleButton';
import { ConsentCheckbox } from './ConsentCheckbox';
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
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True for the span of our own handleSubmit, incl. the setState('signed_in') that
  // refreshMe() triggers: without this, that status flip re-runs the effect below and
  // races its router.replace('/child/') against redirectAfterAuth's own destination
  // (e.g. back to an invite) -- a race Chromium usually won but WebKit didn't, landing
  // signed-up invitees on /child/ (then ChildShell's empty-profiles guard bounced
  // them to /onboarding/kind/) instead of back at the invite they came from.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (status === 'signed_in' && !submittingRef.current) router.replace('/child/');
  }, [status, router]);

  useEffect(() => {
    void getAuthProviders().then((providers) => setInviteCodeRequired(providers.invite_code_required));
  }, []);

  if (status === 'signed_in') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    submittingRef.current = true;
    try {
      const invite_token = (await getPendingInviteToken()) ?? undefined;
      await signUp(email, password, name, Date.now(), { invite_code: inviteCode || undefined, invite_token });
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
      submittingRef.current = false;
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Create account</h1>
      <ConsentCheckbox checked={consented} onChange={setConsented} required />
      {HAS_OAUTH ? (
        <div className={styles.form}>
          <GoogleButton consented={consented} />
          <AppleButton consented={consented} />
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
        <Button type="submit" fullWidth loading={loading} disabled={!consented}>
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

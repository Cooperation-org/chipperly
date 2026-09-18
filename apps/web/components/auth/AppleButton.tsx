'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TokensResponseSchema, type TokensResponse } from '@chipperly/shared/schemas/auth';
import { api, ApiError, setTokens } from '@/lib/api/client';
import { withBase } from '@/lib/api/base';
import { refreshMe } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { getAuthProviders, type AuthProviders } from './providers';
import { getPendingInviteToken, redirectAfterAuth } from './postAuthRedirect';
import { ConsentCheckbox } from './ConsentCheckbox';
import styles from './AppleButton.module.css';

// ponytail: technical-plan.md's web env vars don't list a public Apple client
// id (only the server-side APPLE_SIGNIN_* vars). Reported under
// missingDeps/openIssues; until it's added this button stays hidden, same as
// Google when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset.
const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
const APPLE_JS_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

interface AppleSignInResponse {
  authorization: { id_token: string };
}

interface AppleAuth {
  init(config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
  signIn(): Promise<AppleSignInResponse>;
}

declare global {
  interface Window {
    AppleID?: { auth: AppleAuth };
  }
}

let appleLoad: Promise<void> | null = null;
let appleInitialized = false;

/** Loads the Sign in with Apple JS SDK once and shares the promise across every mount. */
function loadAppleJs(): Promise<void> {
  appleLoad ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_JS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('apple js load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = APPLE_JS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('apple js load failed'));
    document.head.appendChild(script);
  });
  return appleLoad;
}

export interface AppleButtonProps {
  /** S2: gates the button until the page's own consent checkbox is ticked. S1 (existing users) passes true. */
  consented: boolean;
}

/**
 * "Continue with Apple", shown only when the client id is configured and the server has it enabled.
 * While `!consented` this renders disabled with a hint. If the API still 409s consent_required (a
 * brand-new user signing in from S1, which has no checkbox of its own), this shows the same consent
 * copy inline and retries with the id_token it already has (no need to reopen the Apple popup).
 */
export function AppleButton({ consented }: AppleButtonProps) {
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [inlineConsented, setInlineConsented] = useState(false);
  const idTokenRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!APPLE_CLIENT_ID) return;
    let cancelled = false;
    void getAuthProviders().then((result) => {
      if (!cancelled) setProviders(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabled = providers?.apple ?? false;

  if (!APPLE_CLIENT_ID || !enabled) return null;

  async function submit(idToken: string, consentedAt: number | undefined): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const invite_token = (await getPendingInviteToken()) ?? undefined;
      const tokens = await api.post<TokensResponse>(
        '/auth/apple',
        {
          id_token: idToken,
          invite_code: inviteCode || undefined,
          invite_token,
          consented_at: consentedAt,
        },
        { schema: TokensResponseSchema },
      );
      await setTokens(tokens);
      await refreshMe();
      await redirectAfterAuth(router);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'consent_required') {
        idTokenRef.current = idToken;
        setNeedsConsent(true);
        return;
      }
      setError(
        err instanceof ApiError && err.code === 'invite_code_invalid' ? err.message : "Couldn't sign in with Apple.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleClick(): Promise<void> {
    const clientId = APPLE_CLIENT_ID;
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      await loadAppleJs();
      if (!window.AppleID) throw new Error('Apple JS unavailable');
      if (!appleInitialized) {
        window.AppleID.auth.init({
          clientId,
          scope: '',
          redirectURI: `${window.location.origin}${withBase('/')}`,
          usePopup: true,
        });
        appleInitialized = true;
      }
      const result = await window.AppleID.auth.signIn();
      setLoading(false);
      await submit(result.authorization.id_token, Date.now());
    } catch {
      setLoading(false);
      setError("Couldn't sign in with Apple.");
    }
  }

  return (
    <div className={styles.container}>
      {providers?.invite_code_required ? (
        <TextField
          label="Beta invite code"
          placeholder="Ask Chipperly for the code"
          autoComplete="off"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />
      ) : null}
      <Button variant="secondary" fullWidth loading={loading} disabled={!consented} onClick={() => void handleClick()}>
        Continue with Apple
      </Button>
      {!consented ? <p className={styles.hint}>Agree to the Terms and Privacy Policy above first.</p> : null}
      {needsConsent ? (
        <ConsentCheckbox
          id="apple-inline-consent"
          checked={inlineConsented}
          onChange={(checked) => {
            setInlineConsented(checked);
            if (checked && idTokenRef.current) {
              setNeedsConsent(false);
              void submit(idTokenRef.current, Date.now());
            }
          }}
        />
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

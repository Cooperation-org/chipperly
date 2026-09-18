'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { getAuthProviders, type AuthProviders } from './providers';
import { getPendingInviteToken, redirectAfterAuth } from './postAuthRedirect';
import { ConsentCheckbox } from './ConsentCheckbox';
import styles from './GoogleButton.module.css';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme: 'outline' | 'filled_blue'; size: 'large' | 'medium' | 'small'; width?: number; text: string },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let gsiLoad: Promise<void> | null = null;

/** Loads the Google Identity Services script once and shares the promise across every mount. */
function loadGsi(): Promise<void> {
  gsiLoad ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gsi load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gsi load failed'));
    document.head.appendChild(script);
  });
  return gsiLoad;
}

export interface GoogleButtonProps {
  /** S2: gates the button until the page's own consent checkbox is ticked. S1 (existing users) passes true. */
  consented: boolean;
}

/**
 * "Continue with Google", shown only when the client id is configured and the server has it enabled.
 * While `!consented` this renders disabled with a hint instead of loading GSI at all. If the API still
 * 409s consent_required (a brand-new user signing in from S1, which has no checkbox of its own), this
 * shows the same consent copy inline under the button and retries with the credential it already has.
 */
export function GoogleButton({ consented }: GoogleButtonProps) {
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [inlineConsented, setInlineConsented] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // The GSI callback below is wired up once (not on every keystroke, which would tear down and
  // re-render the button), so it reads the invite code from a ref instead of the `inviteCode` state.
  const inviteCodeRef = useRef('');
  const credentialRef = useRef<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    void getAuthProviders().then((result) => {
      if (!cancelled) setProviders(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabled = providers?.google ?? false;

  async function submit(credential: string, consentedAt: number | undefined): Promise<void> {
    try {
      setError(null);
      const invite_token = (await getPendingInviteToken()) ?? undefined;
      await signInWithGoogle(credential, {
        invite_code: inviteCodeRef.current || undefined,
        invite_token,
        consented_at: consentedAt,
      });
      await redirectAfterAuth(router);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'consent_required') {
        credentialRef.current = credential;
        setNeedsConsent(true);
        return;
      }
      setError(err instanceof ApiError && err.code === 'invite_code_invalid' ? err.message : "Couldn't sign in with Google.");
    }
  }

  useEffect(() => {
    if (!enabled || !GOOGLE_CLIENT_ID || !consented) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    void loadGsi()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void submit(response.credential, Date.now());
          },
        });
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          width: Math.round(container.getBoundingClientRect().width) || 320,
          text: 'continue_with',
        });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load Google sign-in.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit closes over refs, not state; re-running it on every render would tear down and re-render Google's button.
  }, [enabled, consented, router]);

  if (!GOOGLE_CLIENT_ID || !enabled) return null;

  return (
    <div className={styles.container}>
      {providers?.invite_code_required ? (
        <TextField
          label="Beta invite code"
          placeholder="Ask Chipperly for the code"
          autoComplete="off"
          value={inviteCode}
          onChange={(e) => {
            setInviteCode(e.target.value);
            inviteCodeRef.current = e.target.value;
          }}
        />
      ) : null}
      {consented ? (
        <div ref={containerRef} className={styles.wrap} />
      ) : (
        <>
          <Button variant="secondary" fullWidth disabled>
            Continue with Google
          </Button>
          <p className={styles.hint}>Agree to the Terms and Privacy Policy above first.</p>
        </>
      )}
      {needsConsent ? (
        <ConsentCheckbox
          id="google-inline-consent"
          checked={inlineConsented}
          onChange={(checked) => {
            setInlineConsented(checked);
            if (checked && credentialRef.current) {
              setNeedsConsent(false);
              void submit(credentialRef.current, Date.now());
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '@/lib/auth/session';
import { getAuthProviders } from './providers';
import { redirectAfterAuth } from './postAuthRedirect';
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

/** "Continue with Google", shown only when the client id is configured and the server has it enabled. */
export function GoogleButton() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    void getAuthProviders().then((providers) => {
      if (!cancelled && providers.google) setEnabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !GOOGLE_CLIENT_ID) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    void loadGsi()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void (async () => {
              try {
                setError(null);
                await signInWithGoogle(response.credential);
                await redirectAfterAuth(router);
              } catch {
                setError("Couldn't sign in with Google.");
              }
            })();
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
  }, [enabled, router]);

  if (!GOOGLE_CLIENT_ID || !enabled) return null;

  return (
    <div>
      <div ref={containerRef} className={styles.wrap} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

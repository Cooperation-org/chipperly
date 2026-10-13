'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { TwoStepPass, TwoStepSetup, TwoStepStatus } from '@chipperly/shared/schemas/admin';
import { NEED_CODE_EVENT, getAdminPass, setAdminPass } from '@/lib/admin/pass';
import { api, ApiError } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { QrCode } from '@/components/ui/QrCode';
import { TextField } from '@/components/ui/TextField';
import styles from './AdminShell.module.css';

type Stage = 'checking' | 'open' | 'setup' | 'code' | 'recovery-codes' | 'failed';

/**
 * Stands between an admin and the admin site until an authenticator code is
 * accepted (lib/admin/pass.ts keeps the 12-hour pass). First time: scan,
 * confirm a code, save the recovery codes. After that: one code per sign-in.
 */
export function TwoStepGate({ email, children }: { email: string; children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('checking');
  const [setup, setSetup] = useState<TwoStepSetup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);

  const check = useCallback(async () => {
    try {
      const status = await api.get<TwoStepStatus>('/admin/2fa/status');
      if (!status.required || getAdminPass()) setStage('open');
      else if (status.enrolled) setStage('code');
      else {
        setSetup(await api.post<TwoStepSetup>('/admin/2fa/setup'));
        setStage('setup');
      }
    } catch {
      setStage('failed');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await check();
    })();
    // A pass that ran out mid-session: ask again, keeping the page underneath.
    const onNeed = () => {
      setAdminPass(null);
      void check();
    };
    window.addEventListener(NEED_CODE_EVENT, onNeed);
    return () => window.removeEventListener(NEED_CODE_EVENT, onNeed);
  }, [check]);

  if (stage === 'open') return <>{children}</>;
  if (stage === 'checking') return null;
  if (stage === 'failed') {
    return (
      <main className={styles.denied}>
        <p role="alert">Couldn&rsquo;t reach the server. Check your connection, then reload.</p>
        <Button onClick={() => void check()}>Try again</Button>
      </main>
    );
  }

  if (stage === 'recovery-codes') {
    const text = codes.join('\n');
    return (
      <main className={styles.denied}>
        <h1 className={styles.title}>Save your recovery codes</h1>
        <p>If you lose your phone, each of these lets you in once. Keep them somewhere safe, like a password manager. You won&rsquo;t see them again.</p>
        <pre className={styles.codes}>{text}</pre>
        <div className={styles.row}>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(text).then(
                () => toast('Codes copied'),
                () => toast("Couldn't copy. Select them and copy by hand."),
              )
            }
          >
            Copy
          </Button>
          <Button variant="secondary" onClick={() => download(text)}>
            Download
          </Button>
        </div>
        <Button onClick={() => setStage('open')}>I saved them, continue</Button>
      </main>
    );
  }

  return (
    <main className={styles.denied}>
      <h1 className={styles.title}>{stage === 'setup' ? 'Set up two-step sign-in' : 'Enter your code'}</h1>
      {stage === 'setup' && setup ? (
        <>
          <p>The admin site can move money and change accounts, so it asks for a code from your phone as well as your password.</p>
          <ol className={styles.steps}>
            <li>Open an authenticator app (Google Authenticator, 1Password, Authy or Microsoft Authenticator).</li>
            <li>Scan this code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <QrCode value={setup.otpauth_url} size={196} />
          <p className={styles.muted}>
            Key for {email}: <code className={styles.key}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          </p>
        </>
      ) : (
        <p>Open your authenticator app and enter the 6-digit code for Chipperly admin.</p>
      )}
      <CodeForm
        allowRecovery={stage === 'code'}
        submit={async (code) => {
          const pass = await api.post<TwoStepPass>(stage === 'setup' ? '/admin/2fa/confirm' : '/admin/2fa/verify', { code });
          setAdminPass({ token: pass.token, expires_at: pass.expires_at });
          if (pass.recovery_codes?.length) {
            setCodes(pass.recovery_codes);
            setStage('recovery-codes');
          } else setStage('open');
        }}
      />
    </main>
  );
}

function CodeForm({ allowRecovery, submit }: { allowRecovery: boolean; submit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await submit(code.trim());
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't check the code. Try again.");
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  const ready = recovery ? code.replace(/[\s-]/g, '').length >= 8 : /^\d{6}$/.test(code.replace(/\s/g, ''));
  return (
    <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
      <TextField
        label={recovery ? 'Recovery code' : '6-digit code'}
        value={code}
        autoFocus
        autoComplete="one-time-code"
        inputMode={recovery ? 'text' : 'numeric'}
        maxLength={recovery ? 12 : 7}
        error={error}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" fullWidth loading={busy} disabled={!ready}>
        Continue
      </Button>
      {allowRecovery ? (
        <button type="button" className={styles.linkButton} onClick={() => { setRecovery((r) => !r); setCode(''); setError(undefined); }}>
          {recovery ? 'Use a code from the app instead' : 'Lost your phone? Use a recovery code'}
        </button>
      ) : null}
    </form>
  );
}

function download(text: string): void {
  const url = URL.createObjectURL(new Blob([`Chipperly admin recovery codes\n\n${text}\n`], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chipperly-admin-recovery-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
}

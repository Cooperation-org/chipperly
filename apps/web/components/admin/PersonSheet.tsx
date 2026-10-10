'use client';

import { useState } from 'react';
import type { AdminUser } from '@chipperly/shared/schemas/billing';
import { compUntilAfter, eraseDue } from '@/lib/admin/person';
import { api, ApiError } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import styles from './AdminDashboard.module.css';

function day(ms: number): string {
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One person, for a super admin: their name and email, free access for their accounts, and closing
 * or erasing their sign-in. Every action saves at once and reloads the list behind the sheet.
 */
export function PersonSheet({ person, onChanged, onClose }: { person: AdminUser; onChanged: () => void; onClose: () => void }) {
  const [name, setName] = useState(person.display_name);
  const [email, setEmail] = useState(person.email);
  const [verified, setVerified] = useState(person.email_verified);
  const [accounts, setAccounts] = useState(person.accounts);
  const [closedAt, setClosedAt] = useState(person.deactivated_at);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // Read once: the clock must not be read during render.
  const [now] = useState(() => Date.now());

  async function act(run: () => Promise<void>, done: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await run();
      toast(done);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const saveDetails = () =>
    act(() => api.patch(`/admin/users/${person.id}`, { display_name: name.trim(), email: email.trim(), email_verified: verified }), 'Saved');

  const giveAccess = (accountId: string, until: number | null) =>
    act(async () => {
      await api.put(`/admin/accounts/${accountId}/comp`, { until, note: null });
      setAccounts((all) => all.map((a) => (a.id === accountId ? { ...a, comp_until: until } : a)));
    }, until === null ? 'Free access removed' : `Free access until ${day(until)}`);

  const close = () =>
    act(async () => {
      await api.post(`/admin/users/${person.id}/deactivate`);
      setClosedAt(Date.now());
    }, 'Sign-in closed');

  const reopen = () =>
    act(async () => {
      await api.post(`/admin/users/${person.id}/reactivate`);
      setClosedAt(null);
    }, 'Sign-in reopened');

  const erase = () =>
    act(async () => {
      await api.delete(`/admin/users/${person.id}`, { confirm_email: confirmEmail.trim().toLowerCase() });
      onClose();
    }, `${person.display_name} was erased`);

  const due = eraseDue(closedAt, now);

  return (
    <div className={styles.form}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="They sign in with this." />
      <div className={styles.toggleRow}>
        <span>Email verified</span>
        <Switch label="Email verified" checked={verified} onChange={setVerified} />
      </div>
      <Button onClick={() => void saveDetails()} loading={busy} disabled={!name.trim() || !email.trim()}>
        Save
      </Button>

      <h3 className={styles.subheading}>Free access</h3>
      <p className={styles.muted}>Counts as a subscription until the date, with no payment. It matters once payments are switched on.</p>
      {accounts.length === 0 ? <p className={styles.muted}>They are not in any account yet.</p> : null}
      {accounts.map((a) => (
        <div key={a.id} className={styles.accountRow}>
          <span>
            <strong>{a.name}</strong> <span className={styles.muted}>({a.kind}, {a.role})</span>
            <br />
            {a.comp_until && a.comp_until > now ? `Free until ${day(a.comp_until)}` : 'No free access'}
          </span>
          <span className={styles.actions}>
            <Button variant="secondary" disabled={busy} onClick={() => void giveAccess(a.id, compUntilAfter(a.comp_until, 30, now))}>
              +1 month
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void giveAccess(a.id, compUntilAfter(a.comp_until, 365, now))}>
              +1 year
            </Button>
            {a.comp_until ? (
              <Button variant="ghost" disabled={busy} onClick={() => void giveAccess(a.id, null)}>
                Remove
              </Button>
            ) : null}
          </span>
        </div>
      ))}

      <h3 className={styles.subheading}>Sign-in</h3>
      {due === null ? (
        <>
          <p className={styles.muted}>Closing it stops them signing in. Nothing is removed, and you can reopen it.</p>
          <Button variant="danger" disabled={busy} onClick={() => void close()}>
            Close their sign-in
          </Button>
        </>
      ) : (
        <>
          <p className={styles.muted}>
            Closed. {due.due ? 'They can now be erased for good.' : `They can be erased for good from ${day(due.at)}.`}
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void reopen()}>
            Reopen their sign-in
          </Button>
          {due.due ? (
            <>
              <p className={styles.muted}>
                Erasing removes them, and any account nobody else uses, with everything in it. It cannot be undone except from a backup. Type their email to confirm.
              </p>
              <TextField label="Their email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoCapitalize="none" />
              <Button variant="danger" disabled={busy || confirmEmail.trim().toLowerCase() !== person.email} onClick={() => void erase()}>
                Erase for good
              </Button>
            </>
          ) : null}
        </>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

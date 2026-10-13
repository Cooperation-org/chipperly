'use client';

import { useEffect, useState } from 'react';
import type { AdminEmail } from '@chipperly/shared/schemas/admin';
import type { AdminUser, PromoCode } from '@chipperly/shared/schemas/billing';
import { compUntilAfter, eraseDue } from '@/lib/admin/person';
import { trialDaysLeft } from '@/lib/billing/promo';
import { canAct, canChange, useAdminRole } from '@/lib/admin/role';
import { api, ApiError } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { CustomerBillingSheet } from './CustomerBillingSheet';
import styles from './AdminDashboard.module.css';

const EVENT_WORDS: Record<string, string> = {
  delivered: 'Delivered',
  bounced: 'Bounced (address may be wrong)',
  opened: 'Opened',
  clicked: 'Opened',
  complained: 'Marked as spam',
  sent: 'Sent',
};
const RESULT_WORDS: Record<string, string> = { sent: 'Sent', failed: 'Not sent: the mail provider refused it', logged: 'Not sent: no mail provider on this server' };

function when(ms: number): string {
  return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One person: their name and email, their trial and early access code, free access for their
 * accounts, and closing or erasing their sign-in. Every action saves at once and reloads the list
 * behind the sheet.
 */
export function PersonSheet({ person, offers, onChanged, onClose }: { person: AdminUser; offers: readonly PromoCode[]; onChanged: () => void; onClose: () => void }) {
  const sheet = useSheet();
  const [name, setName] = useState(person.display_name);
  const [email, setEmail] = useState(person.email);
  const [verified, setVerified] = useState(person.email_verified);
  const [accounts, setAccounts] = useState(person.accounts);
  const [closedAt, setClosedAt] = useState(person.deactivated_at);
  const [trialEndsAt, setTrialEndsAt] = useState(person.trial_ends_at);
  const [code, setCode] = useState(person.personal_code);
  const [offer, setOffer] = useState(offers[0]?.code ?? '');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // Read once: the clock must not be read during render.
  const [now] = useState(() => Date.now());
  const role = useAdminRole();
  const [emails, setEmails] = useState<AdminEmail[] | null>(null);

  useEffect(() => {
    api.get<{ emails: AdminEmail[] }>(`/admin/users/${person.id}/emails`).then(
      (r) => setEmails(r.emails),
      () => setEmails([]),
    );
  }, [person.id]);

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

  const extendTrial = (days: number) =>
    act(async () => {
      const { trial_ends_at } = await api.post<{ trial_ends_at: number }>(`/admin/users/${person.id}/extend-trial`, { days });
      setTrialEndsAt(trial_ends_at);
    }, `Added ${days} days to ${person.display_name}'s trial`);

  const giveCode = () =>
    act(async () => {
      const r = await api.post<{ code: string }>(`/admin/users/${person.id}/issue-code`, { offer });
      setCode(r.code);
    }, `Gave ${person.display_name} a code`);

  const resendVerification = () => act(() => api.post(`/admin/users/${person.id}/resend-verification`), 'Verification email sent');

  const resetTwoStep = () => {
    if (!window.confirm(`Reset two-step sign-in for ${person.email}? They will set it up again, with a new code, the next time they sign in to the admin site.`)) return;
    void act(() => api.delete(`/admin/users/${person.id}/2fa`), 'Two-step sign-in reset');
  };

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

  const erase = (now = false) =>
    act(async () => {
      await api.delete(`/admin/users/${person.id}`, { confirm_email: confirmEmail.trim().toLowerCase(), now });
      onClose();
    }, `${person.display_name} was erased`);

  const due = eraseDue(closedAt, now);

  return (
    <div className={styles.form}>
      {canChange(role) ? (
        <>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="They sign in with this." />
      <div className={styles.toggleRow}>
        <span>Email verified</span>
        <Switch label="Email verified" checked={verified} onChange={setVerified} />
      </div>
      <Button onClick={() => void saveDetails()} loading={busy} disabled={!name.trim() || !email.trim()}>
        Save
      </Button>
        </>
      ) : (
        <p className={styles.muted}>
          {person.email}
          {verified ? '' : ' (email not verified)'}
        </p>
      )}

      {canAct(role) ? (
        <>
          <h3 className={styles.subheading}>Trial</h3>
          <p className={styles.muted}>
            {trialDaysLeft(trialEndsAt) > 0 ? `Ends ${day(trialEndsAt)}, ${trialDaysLeft(trialEndsAt)} days from now.` : `Ended ${day(trialEndsAt)}.`}
          </p>
          <span className={styles.actions}>
            <Button variant="secondary" disabled={busy} onClick={() => void extendTrial(7)}>
              Add 7 days
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void extendTrial(21)}>
              Add 21 days
            </Button>
          </span>

          <h3 className={styles.subheading}>Early access code</h3>
          {code ? (
            <p className={styles.muted}>
              Their code is <strong>{code}</strong>. It is used once their trial ends.
            </p>
          ) : offers.length === 0 ? (
            <p className={styles.muted}>No offer is running, so there is no code to give. Offers are on the Offers page.</p>
          ) : (
            <>
              <label className={styles.cellStack}>
                <span className={styles.muted}>Offer</span>
                <select value={offer} onChange={(e) => setOffer(e.target.value)}>
                  {offers.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code}
                      {o.percent_off ? ` (${o.percent_off}% off)` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" disabled={busy || !offer} onClick={() => void giveCode()}>
                Give them a code
              </Button>
            </>
          )}
        </>
      ) : null}

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
            <Button variant="secondary" onClick={() => sheet.open(<CustomerBillingSheet accountId={a.id} />, { title: `${a.name}: billing` })}>
              Billing
            </Button>
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

      {person.admin_role ? (
        <p className={styles.muted}>
          Admin site role: {person.admin_role === 'super' ? 'super admin' : person.admin_role}. Roles are set on the Admin team page.
        </p>
      ) : null}

      <h3 className={styles.subheading}>Emails</h3>
      {emails === null ? null : emails.length === 0 ? (
        <p className={styles.muted}>No emails sent to them yet.</p>
      ) : (
        <ul className={styles.form}>
          {emails.map((m) => (
            <li key={m.id} className={styles.cellStack}>
              <span className={styles.name}>{m.subject}</span>
              <span className={styles.muted}>
                {when(m.at)} · {m.result === 'sent' ? (m.last_event ? (EVENT_WORDS[m.last_event] ?? m.last_event) : 'Sent') : (RESULT_WORDS[m.result] ?? m.result)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canAct(role) && !verified ? (
        <Button variant="secondary" disabled={busy} onClick={() => void resendVerification()}>
          Resend verification email
        </Button>
      ) : null}

      {canChange(role) && person.admin_role ? (
        <>
          <h3 className={styles.subheading}>Two-step sign-in</h3>
          <p className={styles.muted}>If they lost their phone, reset it. They set it up again the next time they sign in to the admin site.</p>
          <Button variant="secondary" disabled={busy} onClick={resetTwoStep}>
            Reset two-step sign-in
          </Button>
        </>
      ) : null}

      {canChange(role) ? (
        <>
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
                Erasing removes them, any account nobody else uses with everything in it, and their uploaded photos and videos. It cannot be undone; the nightly backups keep a copy for 30 days. Type their email to confirm.
              </p>
              <TextField label="Their email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoCapitalize="none" />
              <Button variant="danger" disabled={busy || confirmEmail.trim().toLowerCase() !== person.email} onClick={() => void erase()}>
                Erase for good
              </Button>
            </>
          ) : null}
        </>
      )}
      {due === null || !due.due ? (
        <details className={styles.eraseNow}>
          <summary>Erase now, without waiting 30 days</summary>
          <p className={styles.muted}>
            For test accounts, or someone who asked to be deleted. Removes them, any account nobody else uses with everything in it, and their uploaded photos and videos.
            Photos another account still uses are kept. It cannot be undone; the nightly backups keep a copy for 30 days. Type their email to confirm.
          </p>
          <TextField label="Their email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoCapitalize="none" />
          <Button variant="danger" disabled={busy || confirmEmail.trim().toLowerCase() !== person.email} onClick={() => void erase(true)}>
            Erase {person.display_name} now
          </Button>
        </details>
      ) : null}
        </>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

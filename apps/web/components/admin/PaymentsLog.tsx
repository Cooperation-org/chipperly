'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminPayments } from '@chipperly/shared/schemas/billing';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import styles from './AdminDashboard.module.css';

function when(ms: number): string {
  return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function day(ms: number | null): string {
  return ms === null ? '' : new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Stripe's event names in plain words; anything else shows as Stripe sent it. */
const EVENT_WORDS: Record<string, string> = {
  'customer.subscription.created': 'Subscription started',
  'customer.subscription.updated': 'Subscription changed',
  'customer.subscription.deleted': 'Subscription ended',
};

const RESULT_WORDS: Record<string, string> = {
  applied: 'Saved',
  ignored: 'Received, nothing to do',
};

/** Super admins only: the subscriptions the app holds, and the newest events Stripe has sent. Read-only. */
export function PaymentsLog() {
  const { user } = useSession();
  const [log, setLog] = useState<AdminPayments | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api.get<AdminPayments>('/admin/payments').then(
      (r) => {
        setLog(r);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [user?.is_super_admin, load]);

  if (!user?.is_super_admin) return <p className={styles.muted}>This page is for Chipperly&rsquo;s own team.</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load the payments log.</p>;
  if (!log) return null;

  return (
    <div className={styles.page} data-wide>
      <div className={styles.headRow}>
        <p className={styles.muted}>{log.enabled ? 'Payments are switched on.' : 'Payments are switched off on this server.'}</p>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <section className={styles.card} aria-label="Subscriptions">
        <h2 className={styles.heading}>Subscriptions</h2>
        {log.subscriptions.length === 0 ? (
          <p className={styles.muted}>Nobody has subscribed yet.</p>
        ) : (
          <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Status</th>
                <th scope="col">Paid until</th>
                <th scope="col">Last change</th>
              </tr>
            </thead>
            <tbody>
              {log.subscriptions.map((s) => (
                <tr key={s.account_id}>
                  <td data-label="Account">
                    <span className={styles.name}>{s.account_name ?? 'Account removed'}</span>
                    {s.kind ? <span className={styles.muted}> {s.kind}</span> : null}
                  </td>
                  <td data-label="Status">
                    {s.status}
                    {s.cancel_at_period_end ? ', will not renew' : ''}
                  </td>
                  <td data-label="Paid until">{day(s.current_period_end)}</td>
                  <td data-label="Last change">{when(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Messages from Stripe">
        <h2 className={styles.heading}>Messages from Stripe</h2>
        <p className={styles.muted}>The newest 200. Each one passed the signature check before it was listed.</p>
        {log.events.length === 0 ? (
          <p className={styles.muted}>Nothing has arrived yet.</p>
        ) : (
          <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Account</th>
                <th scope="col">Status</th>
                <th scope="col">What we did</th>
              </tr>
            </thead>
            <tbody>
              {log.events.map((e) => (
                <tr key={e.id}>
                  <td data-label="When">{when(e.received_at)}</td>
                  <td data-label="What" title={e.id}>
                    {EVENT_WORDS[e.type] ?? e.type}
                  </td>
                  <td data-label="Account">{e.account_name ?? ''}</td>
                  <td data-label="Status">{e.status ?? ''}</td>
                  <td data-label="What we did">{e.result ? (RESULT_WORDS[e.result] ?? e.result) : 'Saved'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

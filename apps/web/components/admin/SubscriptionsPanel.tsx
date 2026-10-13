'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminSubscription } from '@chipperly/shared/schemas/admin';
import { api, ApiError } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { day, money, NOT_TEAM } from './format';
import styles from './AdminDashboard.module.css';

type Filter = 'all' | 'active' | 'past_due' | 'cancelled';
const GROUPS: Record<Exclude<Filter, 'all'>, string[]> = {
  active: ['active', 'trialing'],
  past_due: ['past_due'],
  cancelled: ['canceled', 'incomplete_expired', 'unpaid'],
};
const PER_YEAR: Record<string, number> = { month: 12, year: 1, week: 52, day: 365 };

function CancelSheet({ sub, onDone }: { sub: AdminSubscription; onDone: () => void }) {
  const [when, setWhen] = useState<'end' | 'now'>('end');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function cancel(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/admin/subscriptions/${sub.id}/cancel`, { at_period_end: when === 'end', note: note.trim() });
      toast(when === 'end' ? 'It will end at the end of the paid period' : 'Cancelled');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <Segmented
        label="When"
        value={when}
        onChange={(v) => setWhen(v as 'end' | 'now')}
        items={[
          { value: 'end', label: 'At the end of the paid period' },
          { value: 'now', label: 'Right now, no refund' },
        ]}
      />
      <TextField label="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button variant="danger" loading={busy} onClick={() => void cancel()}>
        Cancel subscription
      </Button>
    </div>
  );
}

/** Every Stripe subscription, read live. Super admins can cancel. */
export function SubscriptionsPanel() {
  const role = useAdminRole();
  const sheet = useSheet();
  const [data, setData] = useState<{ enabled: boolean; subscriptions: AdminSubscription[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api.get<{ enabled: boolean; subscriptions: AdminSubscription[] }>('/admin/subscriptions').then(
      (r) => {
        setData(r);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load subscriptions.</p>;
  if (!data) return null;
  if (!data.enabled) return <p className={styles.muted}>Payments are switched off on this server.</p>;

  const q = query.trim().toLowerCase();
  const shown = data.subscriptions.filter(
    (s) =>
      (filter === 'all' || GROUPS[filter].includes(s.status)) &&
      (!q || `${s.account_name ?? ''} ${s.customer_email ?? ''}`.toLowerCase().includes(q)),
  );
  const active = data.subscriptions.filter((s) => GROUPS.active.includes(s.status));
  // ponytail: assumes one currency (usd); split per currency if another is ever sold.
  const yearly = active.reduce((sum, s) => sum + (s.amount ?? 0) * (PER_YEAR[s.interval ?? ''] ?? 0), 0);

  function cancel(sub: AdminSubscription): void {
    sheet.open(
      <CancelSheet
        sub={sub}
        onDone={() => {
          sheet.close();
          load();
        }}
      />,
      { title: `Cancel ${sub.account_name ?? sub.customer_email ?? 'subscription'}` },
    );
  }

  return (
    <div className={styles.page} data-wide>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{active.length}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{money(yearly)}</span>
          <span className={styles.statLabel}>A year, from active plans</span>
        </div>
      </div>

      <section className={styles.card} aria-label="Subscriptions">
        <div className={styles.headRow}>
          <h2 className={styles.heading}>Subscriptions</h2>
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          items={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'past_due', label: 'Past due' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <TextField label="Search account or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        {shown.length === 0 ? (
          <p className={styles.muted}>Nothing here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Status</th>
                  <th scope="col">Renews or ends</th>
                  <th scope="col">Started</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Account">
                      <div className={styles.cellStack}>
                        <span className={styles.name}>{s.account_name ?? s.customer_email ?? s.customer_id}</span>
                        {s.account_kind ? <span className={styles.muted}>{s.account_kind}</span> : null}
                        {s.account_name && s.customer_email ? <span className={styles.muted}>{s.customer_email}</span> : null}
                      </div>
                    </td>
                    <td data-label="Plan">
                      {s.amount === null ? '' : `${money(s.amount, s.currency)} / ${s.interval ?? ''}`}
                      {s.collection_method === 'send_invoice' ? ', invoice' : ''}
                    </td>
                    <td data-label="Status">
                      {s.status}
                      {s.cancel_at_period_end ? ', will not renew' : ''}
                    </td>
                    <td data-label="Renews or ends" className={styles.nowrap}>
                      {day(s.current_period_end)}
                    </td>
                    <td data-label="Started" className={styles.nowrap}>
                      {day(s.created)}
                    </td>
                    <td data-label="" className={styles.rowActions}>
                      <div className={styles.actions}>
                        <a href={`https://dashboard.stripe.com/subscriptions/${s.id}`} target="_blank" rel="noreferrer">
                          Open in Stripe
                        </a>
                        {role === 'super' && !GROUPS.cancelled.includes(s.status) && !s.cancel_at_period_end ? (
                          <Button variant="secondary" onClick={() => cancel(s)}>
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </td>
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

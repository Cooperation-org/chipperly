'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminCharge, AdminChargesPage } from '@chipperly/shared/schemas/admin';
import { api, ApiError } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { csvName, downloadCsv, toCsv } from './csv';
import { money, NOT_TEAM, when } from './format';
import styles from './AdminDashboard.module.css';

type Reason = 'requested_by_customer' | 'duplicate' | 'fraudulent';

function statusWords(c: AdminCharge): string {
  if (c.disputed) return 'Disputed';
  if (c.status === 'failed') return c.failure_message ? `Failed: ${c.failure_message}` : 'Failed';
  if (c.status === 'pending') return 'Pending';
  if (c.refunded) return 'Refunded';
  if (c.amount_refunded > 0) return `Partly refunded (${money(c.amount_refunded, c.currency)})`;
  return 'Paid';
}

function RefundSheet({ charge, onDone }: { charge: AdminCharge; onDone: () => void }) {
  const left = charge.amount - charge.amount_refunded;
  const [dollars, setDollars] = useState((left / 100).toFixed(2));
  const [reason, setReason] = useState<Reason>('requested_by_customer');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const cents = Math.round(Number(dollars) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && cents <= left;

  async function refund(): Promise<void> {
    if (!valid) {
      setError(`Enter an amount above zero and up to ${money(left, charge.currency)}.`);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/admin/charges/${charge.id}/refund`, { amount: cents, reason, note: note.trim() });
      toast(`Refunded ${money(cents, charge.currency)}`);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't refund it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <p className={styles.muted}>
        {money(charge.amount, charge.currency)} paid {when(charge.created)}. Up to {money(left, charge.currency)} can be refunded.
      </p>
      <TextField label="Amount in dollars" inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} />
      <Segmented
        label="Reason"
        value={reason}
        onChange={(v) => setReason(v as Reason)}
        items={[
          { value: 'requested_by_customer', label: 'Customer asked' },
          { value: 'duplicate', label: 'Duplicate' },
          { value: 'fraudulent', label: 'Fraud' },
        ]}
      />
      <TextField label="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button variant="danger" loading={busy} disabled={!valid} onClick={() => void refund()}>
        {valid ? `Refund ${money(cents, charge.currency)}` : 'Refund'}
      </Button>
    </div>
  );
}

/** Payments as Stripe has them, newest first, with month totals. Super admins can refund. */
export function ChargesPanel() {
  const role = useAdminRole();
  const sheet = useSheet();
  const [data, setData] = useState<AdminChargesPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api.get<AdminChargesPage>('/admin/charges').then(
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
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load payments.</p>;
  if (!data) return null;
  if (!data.enabled) return <p className={styles.muted}>Payments are switched off on this server.</p>;

  const q = query.trim().toLowerCase();
  const shown = data.charges.filter((c) => !q || `${c.account_name ?? ''} ${c.customer_email ?? ''} ${c.description ?? ''}`.toLowerCase().includes(q));

  function refund(charge: AdminCharge): void {
    sheet.open(
      <RefundSheet
        charge={charge}
        onDone={() => {
          sheet.close();
          load();
        }}
      />,
      { title: `Refund ${charge.account_name ?? charge.customer_email ?? 'payment'}` },
    );
  }

  return (
    <div className={styles.page} data-wide>
      <section className={styles.card} aria-label="Totals by month">
        <div className={styles.headRow}>
          <h2 className={styles.heading}>Totals by month</h2>
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        </div>
        <p className={styles.muted}>From the newest {data.charges.length} payments.</p>
        {data.months.length === 0 ? (
          <p className={styles.muted}>No payments yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Refunded</th>
                  <th scope="col">Failed</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={`${m.month} ${m.currency}`}>
                    <td data-label="Month">{m.month}</td>
                    <td data-label="Paid">{money(m.paid, m.currency)}</td>
                    <td data-label="Refunded">{money(m.refunded, m.currency)}</td>
                    <td data-label="Failed">{money(m.failed, m.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Payments">
        <div className={styles.headRow}>
          <h2 className={styles.heading}>Payments</h2>
          <Button variant="secondary" disabled={shown.length === 0} onClick={() => downloadCsv(csvName('payments'), chargesCsv(shown))}>
            Download CSV
          </Button>
        </div>
        <TextField label="Search account or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        {shown.length === 0 ? (
          <p className={styles.muted}>Nothing here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td data-label="When" className={styles.nowrap}>
                      {when(c.created)}
                    </td>
                    <td data-label="Who">
                      <div className={styles.cellStack}>
                        <span className={styles.name}>{c.account_name ?? c.customer_email ?? 'Unknown'}</span>
                        {c.account_name && c.customer_email ? <span className={styles.muted}>{c.customer_email}</span> : null}
                        {c.description ? <span className={styles.muted}>{c.description}</span> : null}
                      </div>
                    </td>
                    <td data-label="Amount">{money(c.amount, c.currency)}</td>
                    <td data-label="Status">{statusWords(c)}</td>
                    <td data-label="" className={styles.rowActions}>
                      <div className={styles.actions}>
                        {c.receipt_url ? (
                          <a href={c.receipt_url} target="_blank" rel="noreferrer">
                            Receipt
                          </a>
                        ) : null}
                        <a href={`https://dashboard.stripe.com/payments/${c.id}`} target="_blank" rel="noreferrer">
                          Open in Stripe
                        </a>
                        {role === 'super' && c.status === 'succeeded' && !c.refunded && c.amount_refunded < c.amount ? (
                          <Button variant="secondary" onClick={() => refund(c)}>
                            Refund
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

/** The payments on screen (after the search), amounts in dollars. */
function chargesCsv(rows: AdminCharge[]): string {
  return toCsv(
    ['Date', 'Account', 'Email', 'Amount', 'Refunded', 'Currency', 'Status', 'Stripe id'],
    rows.map((c) => [
      new Date(c.created).toISOString().slice(0, 10),
      c.account_name ?? '',
      c.customer_email ?? '',
      (c.amount / 100).toFixed(2),
      (c.amount_refunded / 100).toFixed(2),
      c.currency.toUpperCase(),
      statusWords(c),
      c.id,
    ]),
  );
}

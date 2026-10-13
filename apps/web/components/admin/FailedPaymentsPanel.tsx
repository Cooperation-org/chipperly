'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminFailedPayment } from '@chipperly/shared/schemas/admin';
import { api, ApiError } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { useSheet } from '@/components/ui/Sheet';
import { day, money, NOT_TEAM } from './format';
import styles from './AdminDashboard.module.css';

const who = (p: AdminFailedPayment) => p.account_name ?? p.customer_email ?? 'Unknown customer';
const stripeUrl = (p: AdminFailedPayment) => `https://dashboard.stripe.com/${p.kind === 'invoice' ? 'invoices' : 'subscriptions'}/${p.id}`;

/** Says exactly what goes out and to whom, then sends it. */
function RemindSheet({ item, onSent }: { item: AdminFailedPayment; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function send(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const { sent_to } = await api.post<{ sent_to: string[] }>('/admin/failed-payments/remind', {
        kind: item.kind,
        id: item.id,
        account_id: item.account_id,
        pay_url: item.pay_url,
        email: item.customer_email,
      });
      toast(`Reminder sent to ${sent_to.join(', ')}`);
      onSent();
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't send it. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <p>
        {item.kind === 'invoice'
          ? "We'll email a link to pay the invoice, by card or bank transfer."
          : "We'll email a link to Plan in Chipperly, where they update their card."}
      </p>
      <p className={styles.muted}>
        {item.account_id ? `It goes to the admins of ${who(item)}.` : `It goes to ${item.customer_email ?? 'the email on the invoice'}.`}
        {item.reminded_at ? ` The last reminder went out ${day(item.reminded_at)}.` : ''}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button fullWidth loading={busy} onClick={() => void send()}>
        Send reminder
      </Button>
    </div>
  );
}

/** Cards that failed on a subscription, and invoices past their due date, with a reminder per row. */
export function FailedPaymentsPanel() {
  const role = useAdminRole();
  const sheet = useSheet();
  const [data, setData] = useState<{ enabled: boolean; items: AdminFailedPayment[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api.get<{ enabled: boolean; items: AdminFailedPayment[] }>('/admin/failed-payments').then(
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
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load failed payments. Try again in a minute.</p>;
  if (!data) return null;
  if (!data.enabled) return <p className={styles.muted}>Payments are switched off on this server.</p>;

  function remind(item: AdminFailedPayment): void {
    sheet.open(
      <RemindSheet
        item={item}
        onSent={() => {
          sheet.close();
          load();
        }}
      />,
      { title: `Remind ${who(item)}` },
    );
  }

  function copy(url: string): void {
    void navigator.clipboard.writeText(url).then(
      () => toast('Pay link copied'),
      () => toast("Couldn't copy the link."),
    );
  }

  return (
    <div className={styles.page} data-wide>
      <div className={styles.headRow}>
        <p className={styles.muted}>Cards that were declined, and invoices past their due date.</p>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>
      <section className={styles.card} aria-label="Failed payments">
        {data.items.length === 0 ? (
          <p className={styles.muted}>No failed or overdue payments. Everyone is paid up.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Since</th>
                  <th scope="col">Reminder</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Who">
                      <div className={styles.cellStack}>
                        <span className={styles.name}>{who(p)}</span>
                        {p.account_name && p.customer_email ? <span className={styles.muted}>{p.customer_email}</span> : null}
                      </div>
                    </td>
                    <td data-label="What">
                      {p.kind === 'invoice' ? 'Invoice, overdue' : p.status === 'unpaid' ? 'Card payment, unpaid' : 'Card payment, declined'}
                    </td>
                    <td data-label="Amount">{p.amount === null ? '' : money(p.amount, p.currency)}</td>
                    <td data-label="Since" className={styles.nowrap}>
                      {day(p.since)}
                    </td>
                    <td data-label="Reminder">{p.reminded_at ? `Last sent ${day(p.reminded_at)}` : 'Not reminded yet'}</td>
                    <td data-label="">
                      <div className={styles.actions}>
                        {role === 'super' ? <Button onClick={() => remind(p)}>Send reminder</Button> : null}
                        {p.pay_url ? (
                          <Button variant="secondary" onClick={() => copy(p.pay_url!)}>
                            Copy pay link
                          </Button>
                        ) : null}
                        <a href={stripeUrl(p)} target="_blank" rel="noreferrer">
                          Open in Stripe
                        </a>
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

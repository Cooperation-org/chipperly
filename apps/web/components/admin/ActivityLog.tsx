'use client';

import { useEffect, useState } from 'react';
import type { AdminAction } from '@chipperly/shared/schemas/admin';
import { api } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { NOT_TEAM, when } from './format';
import styles from './AdminDashboard.module.css';

const WORDS: Record<string, string> = {
  refund: 'Refund',
  cancel_now: 'Cancelled now',
  cancel_at_period_end: 'Set to end at period end',
  org_payment_link: 'Payment link made',
  org_invoice: 'Invoice sent',
  org_link_withdrawn: 'Link turned off',
  org_invoice_withdrawn: 'Invoice voided',
  support_on: 'Support role on',
  support_off: 'Support role off',
};

/** The admin audit log, read-only. */
export function ActivityLog() {
  const role = useAdminRole();
  const [actions, setActions] = useState<AdminAction[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!role) return;
    api.get<{ actions: AdminAction[] }>('/admin/actions').then(
      (r) => setActions(r.actions),
      () => setFailed(true),
    );
  }, [role]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load the activity log.</p>;
  if (!actions) return null;

  return (
    <div className={styles.page} data-wide>
      <section className={styles.card} aria-label="Activity">
        <h2 className={styles.heading}>Activity</h2>
        <p className={styles.muted}>Refunds, cancels, organization billing and role changes, newest first.</p>
        {actions.length === 0 ? (
          <p className={styles.muted}>Nothing yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Target</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td data-label="When" className={styles.nowrap}>
                      {when(a.at)}
                    </td>
                    <td data-label="Who">{a.admin_email}</td>
                    <td data-label="What">{WORDS[a.action] ?? a.action}</td>
                    <td data-label="Target">{a.target}</td>
                    <td data-label="Detail">{a.detail}</td>
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

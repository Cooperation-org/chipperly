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
  team_support: 'Made support',
  team_moderator: 'Made moderator',
  team_removed: 'Removed from the admin team',
  erased: 'Erased',
  erased_now: 'Erased now',
  person_edited: 'Details changed',
  signin_closed: 'Sign-in closed',
  signin_reopened: 'Sign-in reopened',
  free_access: 'Free access',
  code_given: 'Early access code given',
  trial_extended: 'Trial extended',
  offer_saved: 'Offer saved',
  backup_restored_account: 'Account restored from a backup',
  backup_restored_all: 'Whole database restored from a backup',
  sync_replayed: 'Refused change saved',
  sync_dismissed: 'Refused change dismissed',
  feedback_status: 'Feedback marked',
  plan_changed: 'Plan changed',
  discount_added: 'Discount given',
  discount_removed: 'Discount removed',
  payment_reminder: 'Payment reminder sent',
  beta_code_sent: 'Beta code sent',
  verification_resent: 'Verification email resent',
  org_created: 'Organization created',
  two_step_on: 'Two-step sign-in set up',
  two_step_reset: 'Two-step sign-in reset',
  recovery_code_used: 'Recovery code used',
};

/** The admin audit log, read-only. */
export function ActivityLog() {
  const role = useAdminRole();
  const [actions, setActions] = useState<AdminAction[] | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);
  const [who, setWho] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!role) return;
    api.get<{ actions: AdminAction[]; admins: string[] }>(`/admin/actions${who ? `?admin=${encodeURIComponent(who)}` : ''}`).then(
      (r) => {
        setActions(r.actions);
        setAdmins(r.admins);
      },
      () => setFailed(true),
    );
  }, [role, who]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load the activity log.</p>;
  if (!actions) return null;

  return (
    <div className={styles.page} data-wide>
      <section className={styles.card} aria-label="Activity">
        <h2 className={styles.heading}>Activity</h2>
        <p className={styles.muted}>Everything an admin changed, under their own email, newest first.</p>
        <label className={styles.filterRow}>
          <span>Done by</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {admins.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
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

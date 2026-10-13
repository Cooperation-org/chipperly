'use client';

import { useCallback, useEffect, useState } from 'react';
import { ORG_TIERS, ORG_TIER_KEYS, type FixedOrgTier, type OrgTier } from '@chipperly/shared/constants/orgTiers';
import type { AdminOrg, CreateOrgBillingBody, OrgBilling } from '@chipperly/shared/schemas/admin';
import { api, ApiError } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { day, money, NOT_TEAM } from './format';
import styles from './AdminDashboard.module.css';

const STATUS_WORDS: Record<string, string> = { open: 'Open', paid: 'Paid', deactivated: 'Turned off', void: 'Void' };

function planWords(tier: string | null, seats: number | null): string {
  if (!tier) return 'No plan yet';
  if (tier === 'custom') return `Custom, ${seats ?? '?'} Primary Users`;
  return ORG_TIERS[tier as FixedOrgTier]?.label ?? tier;
}

function copy(url: string): void {
  void navigator.clipboard.writeText(url).then(
    () => toast('Link copied'),
    () => toast("Couldn't copy. Select the link and copy it."),
  );
}

function BillingSheet({ org, onDone }: { org: AdminOrg; onDone: (bill: OrgBilling) => void }) {
  const [method, setMethod] = useState<'link' | 'invoice'>('link');
  const [tier, setTier] = useState<OrgTier>('25');
  const [seats, setSeats] = useState('');
  const [dollars, setDollars] = useState('');
  const [email, setEmail] = useState(org.owner_email ?? '');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function create(): Promise<void> {
    const body: CreateOrgBillingBody = {
      method,
      tier,
      days_until_due: Number(days) || 30,
      note: note.trim(),
      ...(tier === 'custom' ? { seats: Number(seats), yearly_cents: Math.round(Number(dollars) * 100) } : {}),
      ...(method === 'invoice' ? { billing_email: email.trim() } : {}),
    };
    if (tier === 'custom' && (!Number.isInteger(body.seats) || body.seats! < 1 || !Number.isFinite(body.yearly_cents) || body.yearly_cents! < 100)) {
      setError('A custom plan needs a whole number of Primary Users and a yearly price.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      onDone(await api.post<OrgBilling>(`/admin/orgs/${org.id}/billing`, body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <Segmented
        label="How they pay"
        value={method}
        onChange={(v) => setMethod(v as 'link' | 'invoice')}
        items={[
          { value: 'link', label: 'Card payment link' },
          { value: 'invoice', label: 'Invoice by email' },
        ]}
      />
      <p className={styles.muted}>
        {method === 'link'
          ? 'A Stripe page they pay by card. It renews every year.'
          : 'Stripe emails an invoice now. They can pay by card or bank transfer. Their account works while the invoice is open.'}
      </p>
      <Segmented
        label="Plan"
        value={tier}
        onChange={(v) => setTier(v as OrgTier)}
        items={ORG_TIER_KEYS.map((k) =>
          k === 'custom'
            ? { value: k, label: 'Custom (more than 1,000)' }
            : { value: k, label: `${ORG_TIERS[k].label}: ${money(ORG_TIERS[k].yearly_cents)} a year` },
        )}
      />
      {tier === 'custom' ? (
        <>
          <TextField label="Primary Users" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
          <TextField label="Yearly price in dollars" inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} />
        </>
      ) : null}
      {method === 'invoice' ? (
        <>
          <TextField label="Send the invoice to" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Days to pay" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </>
      ) : null}
      <TextField label="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button loading={busy} onClick={() => void create()}>
        {method === 'link' ? 'Make the payment link' : 'Send the invoice'}
      </Button>
    </div>
  );
}

/** Organization accounts, their plan and seats, and the payment links and invoices made for them. */
export function OrgsPanel() {
  const role = useAdminRole();
  const sheet = useSheet();
  const [orgs, setOrgs] = useState<AdminOrg[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api.get<{ orgs: AdminOrg[] }>('/admin/orgs').then(
      (r) => {
        setOrgs(r.orgs);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load organizations.</p>;
  if (!orgs) return null;

  function bill(org: AdminOrg): void {
    sheet.open(
      <BillingSheet
        org={org}
        onDone={(b) => {
          sheet.close();
          if (b.url) copy(b.url);
          else toast('Done');
          load();
        }}
      />,
      { title: `Bill ${org.name}` },
    );
  }

  async function withdraw(b: OrgBilling): Promise<void> {
    if (!window.confirm(b.method === 'link' ? 'Turn this payment link off?' : 'Void this invoice and end its subscription?')) return;
    try {
      await api.post(`/admin/org-billing/${b.id}/withdraw`);
      toast(b.method === 'link' ? 'Link turned off' : 'Invoice voided');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't withdraw it.");
    }
  }

  return (
    <div className={styles.page} data-wide>
      <div className={styles.headRow}>
        <p className={styles.muted}>
          {orgs.length} organization{orgs.length === 1 ? '' : 's'}
        </p>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>
      {orgs.length === 0 ? (
        <p className={styles.muted}>No organization accounts yet. They appear here when someone picks My organization at sign-up.</p>
      ) : null}
      {orgs.map((org) => (
        <section key={org.id} className={styles.card} aria-label={org.name}>
          <div className={styles.headRow}>
            <h2 className={styles.heading}>{org.name}</h2>
            {role === 'super' ? (
              <Button variant="secondary" onClick={() => bill(org)}>
                Bill this organization
              </Button>
            ) : null}
          </div>
          <div className={styles.cellStack}>
            <span className={styles.muted}>
              {org.owner_email ?? 'No owner'} · since {day(org.created_at)}
            </span>
            <span>{planWords(org.org_tier, org.seat_limit)}</span>
            <span>
              {org.primary_users}
              {org.seat_limit !== null ? ` of ${org.seat_limit}` : ''} Primary Users
            </span>
            <span>
              {org.subscription_status ? `Subscription ${org.subscription_status}` : 'No subscription'}
              {org.current_period_end ? `, renews ${day(org.current_period_end)}` : ''}
            </span>
            {org.comp_until ? <span>Free access until {day(org.comp_until)}</span> : null}
          </div>
          {org.billing.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">How</th>
                    <th scope="col">Plan</th>
                    <th scope="col">A year</th>
                    <th scope="col">Status</th>
                    <th scope="col">Made</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {org.billing.map((b) => (
                    <tr key={b.id}>
                      <td data-label="How">
                        <div className={styles.cellStack}>
                          <span>{b.method === 'link' ? 'Payment link' : 'Invoice'}</span>
                          {b.billing_email ? <span className={styles.muted}>{b.billing_email}</span> : null}
                          {b.note ? <span className={styles.muted}>{b.note}</span> : null}
                        </div>
                      </td>
                      <td data-label="Plan">{planWords(b.tier, b.seats)}</td>
                      <td data-label="A year">{money(b.yearly_cents, b.currency)}</td>
                      <td data-label="Status">{STATUS_WORDS[b.status] ?? b.status}</td>
                      <td data-label="Made">
                        <div className={styles.cellStack}>
                          <span className={styles.nowrap}>{day(b.created_at)}</span>
                          <span className={styles.muted}>{b.created_by}</span>
                        </div>
                      </td>
                      <td data-label="" className={styles.rowActions}>
                        <div className={styles.actions}>
                          {b.url ? (
                            <>
                              <Button variant="secondary" onClick={() => copy(b.url!)}>
                                Copy link
                              </Button>
                              <a href={b.url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            </>
                          ) : null}
                          {role === 'super' && b.status === 'open' ? (
                            <Button variant="secondary" onClick={() => void withdraw(b)}>
                              Withdraw
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import local from './OrgsPanel.module.css';

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

type Method = 'link' | 'invoice';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const METHOD_HELP: Record<Method, string> = {
  link: 'A Stripe page they pay by card. It renews every year.',
  invoice: 'Stripe emails an invoice now. They can pay by card or bank transfer. Their account works while the invoice is open.',
};

/** The plan, custom numbers, invoice address and note, shared by "Bill this organization" and "New organization". */
function useBillingForm(defaultEmail: string) {
  const [tier, setTier] = useState<OrgTier>('25');
  const [seats, setSeats] = useState('');
  const [dollars, setDollars] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');

  /** The request body, or a sentence saying what is missing. */
  function build(method: Method): CreateOrgBillingBody | string {
    const body: CreateOrgBillingBody = {
      method,
      tier,
      days_until_due: Number(days) || 30,
      note: note.trim(),
      ...(tier === 'custom' ? { seats: Number(seats), yearly_cents: Math.round(Number(dollars) * 100) } : {}),
      ...(method === 'invoice' ? { billing_email: email.trim().toLowerCase() } : {}),
    };
    if (tier === 'custom' && (!Number.isInteger(body.seats) || body.seats! < 1 || !Number.isFinite(body.yearly_cents) || body.yearly_cents! < 100)) {
      return 'A custom plan needs a whole number of Primary Users and a yearly price.';
    }
    if (method === 'invoice' && !EMAIL.test(body.billing_email ?? '')) return 'Type the email address the invoice goes to.';
    return body;
  }

  /** "Up to 100, $6,000.00 a year", for the summary line. */
  function plan(): string {
    if (tier !== 'custom') return `${ORG_TIERS[tier].label}, ${money(ORG_TIERS[tier].yearly_cents)} a year`;
    return `${seats || '?'} Primary Users, ${dollars ? money(Math.round(Number(dollars) * 100)) : '?'} a year`;
  }

  function fields(method: Method) {
    return (
      <>
        <p className={styles.muted}>{METHOD_HELP[method]}</p>
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
      </>
    );
  }

  return { build, fields, plan, email, setEmail };
}

function BillingSheet({ org, onDone }: { org: AdminOrg; onDone: (bill: OrgBilling) => void }) {
  const [method, setMethod] = useState<Method>('link');
  const form = useBillingForm(org.owner_email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function create(): Promise<void> {
    const body = form.build(method);
    if (typeof body === 'string') {
      setError(body);
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
        onChange={(v) => setMethod(v as Method)}
        items={[
          { value: 'link', label: 'Card payment link' },
          { value: 'invoice', label: 'Invoice by email' },
        ]}
      />
      {form.fields(method)}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button loading={busy} onClick={() => void create()}>
        {method === 'link' ? 'Make the payment link' : 'Send the invoice'}
      </Button>
    </div>
  );
}

/** Two short steps in one sheet: who it is for, then how they pay (or not yet). */
function NewOrgSheet({ onDone }: { onDone: (r: { owner_email: string; billing: OrgBilling | null }) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [pay, setPay] = useState<'none' | Method>('none');
  const form = useBillingForm('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // A new step moves focus to its heading, so a screen reader hears where it is. Not on open: the first field keeps it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  function next(): void {
    if (!name.trim() || !ownerName.trim()) {
      setError('Type the organization name and the owner’s name.');
      return;
    }
    if (!EMAIL.test(ownerEmail.trim())) {
      setError('Type a valid email address for the owner.');
      return;
    }
    setError(undefined);
    // The invoice goes to the owner unless another address is typed.
    if (!form.email) form.setEmail(ownerEmail.trim().toLowerCase());
    setStep(2);
  }

  async function create(): Promise<void> {
    const billing = pay === 'none' ? undefined : form.build(pay);
    if (typeof billing === 'string') {
      setError(billing);
      return;
    }
    setBusy(true);
    setError(undefined);
    const owner = ownerEmail.trim().toLowerCase();
    try {
      const res = await api.post<{ account_id: string; invite_url: string; billing: OrgBilling | null }>('/admin/orgs', {
        name: name.trim(),
        owner_name: ownerName.trim(),
        owner_email: owner,
        ...(billing ? { billing } : {}),
      });
      onDone({ owner_email: owner, billing: res.billing });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create it.");
    } finally {
      setBusy(false);
    }
  }

  const summary =
    `We'll email ${ownerName.trim()} at ${ownerEmail.trim()} an invite to own ${name.trim()}` +
    (pay === 'link' ? `, and a card payment link for ${form.plan()}.` : pay === 'invoice' ? `, and Stripe will email an invoice for ${form.plan()}.` : '.');

  return (
    <div className={styles.form}>
      <p className={styles.muted}>Step {step} of 2</p>
      {step === 1 ? (
        <>
          <h3 ref={heading} tabIndex={-1} className={local.stepTitle}>
            Who is it for
          </h3>
          <TextField label="Organization name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <TextField label="Owner’s name" value={ownerName} maxLength={100} autoComplete="off" onChange={(e) => setOwnerName(e.target.value)} />
          <TextField
            label="Owner’s email"
            type="email"
            value={ownerEmail}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
          <p className={styles.muted}>They get an email to accept. Once they do, they own the organization and can add their staff.</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <Button onClick={next}>Next</Button>
        </>
      ) : (
        <>
          <h3 ref={heading} tabIndex={-1} className={local.stepTitle}>
            How will they pay
          </h3>
          <Segmented
            label="How will they pay"
            value={pay}
            onChange={(v) => setPay(v as 'none' | Method)}
            items={[
              { value: 'none', label: 'Not now' },
              { value: 'link', label: 'Card payment link' },
              { value: 'invoice', label: 'Invoice by email' },
            ]}
          />
          {pay === 'none' ? <p className={styles.muted}>You can bill them later from this page.</p> : form.fields(pay)}
          <p>{summary}</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={local.row}>
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button loading={busy} onClick={() => void create()}>
              Create and send the invite
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Organization accounts, their plan and seats, and the payment links and invoices made for them. */
export function OrgsPanel() {
  const role = useAdminRole();
  const sheet = useSheet();
  const [orgs, setOrgs] = useState<AdminOrg[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The payment link made with a new organization stays on screen until dismissed, so it can be copied and sent.
  const [madeLink, setMadeLink] = useState<string | null>(null);

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

  function newOrg(): void {
    sheet.open(
      <NewOrgSheet
        onDone={(r) => {
          sheet.close();
          toast(`Invite sent to ${r.owner_email}`);
          if (r.billing?.url) setMadeLink(r.billing.url);
          load();
        }}
      />,
      { title: 'New organization' },
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
        <div className={local.row}>
          {role === 'super' ? <Button onClick={newOrg}>New organization</Button> : null}
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>
      {madeLink ? (
        <section className={styles.card} aria-label="New payment link">
          <p>The payment link is ready. Send it to the owner:</p>
          <a href={madeLink} target="_blank" rel="noreferrer" className={local.link}>
            {madeLink}
          </a>
          <div className={local.row}>
            <Button onClick={() => copy(madeLink)}>Copy link</Button>
            <Button variant="secondary" onClick={() => setMadeLink(null)}>
              Done
            </Button>
          </div>
        </section>
      ) : null}
      {orgs.length === 0 ? (
        <p className={styles.muted}>
          No organization accounts yet. They appear here when someone picks My organization at sign-up, or when you make one with New organization.
        </p>
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
            {org.owner_invite_pending ? <span className={local.chip}>Owner invite sent, not accepted yet</span> : null}
            <span className={styles.muted}>
              {org.owner_invite_pending ? 'Owner: invite pending' : `Owner: ${org.owner_email ?? 'none'}`} · since {day(org.created_at)}
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

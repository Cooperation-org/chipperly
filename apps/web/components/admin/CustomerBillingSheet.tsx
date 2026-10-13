'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AdminAccountBilling, AdminPlanOption } from '@chipperly/shared/schemas/admin';
import { ORG_TIERS, type FixedOrgTier } from '@chipperly/shared/constants/orgTiers';
import { useAdminRole } from '@/lib/admin/role';
import { api, ApiError } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { day, money } from './format';
import styles from './AdminDashboard.module.css';
import local from './CustomerBillingSheet.module.css';

type Sub = NonNullable<AdminAccountBilling['subscription']>;

const KIND_WORDS: Record<string, string> = { individual: 'Just me', supported: 'Someone I support', household: 'Family', agency: 'Organization' };
const STATUS_WORDS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Payment failed',
  unpaid: 'Unpaid',
  canceled: 'Cancelled',
  incomplete: 'Waiting for the first payment',
  incomplete_expired: 'First payment never came',
  paused: 'Paused',
};
const INVOICE_WORDS: Record<string, string> = { paid: 'Paid', open: 'Not paid yet', void: 'Voided', uncollectible: 'Written off', draft: 'Draft' };

const per = (interval: string | null) => (interval === 'year' ? 'a year' : interval === 'month' ? 'a month' : interval ? `every ${interval}` : '');
const planLabel = (o: AdminPlanOption) => `${KIND_WORDS[o.kind] ?? o.kind}${o.interval === 'year' ? ' yearly' : ''}, ${money(o.amount, o.currency)} ${per(o.interval)}`;

function statusWords(sub: Sub): string {
  if (sub.cancel_at_period_end && sub.status !== 'canceled') return `Will end on ${day(sub.current_period_end)}`;
  return STATUS_WORDS[sub.status] ?? sub.status;
}

function discountWords(d: Sub['discount']): string {
  if (!d) return 'None';
  const off = d.percent_off !== null ? `${d.percent_off}% off` : d.amount_off !== null ? `${money(d.amount_off)} off` : 'A discount';
  const long = d.duration === 'forever' ? 'for as long as they subscribe' : d.duration === 'once' ? 'on one payment' : d.months ? `for ${d.months} month${d.months === 1 ? '' : 's'}` : '';
  return [off, long, d.ends_at ? `ends ${day(d.ends_at)}` : ''].filter(Boolean).join(', ');
}

/**
 * One customer's money in one place: plan, discount, invoices. Super admins
 * change the plan, add or remove a discount, or cancel, each with a step that
 * says exactly what will happen. Support sees it read-only.
 */
export function CustomerBillingSheet({ accountId }: { accountId: string }) {
  const role = useAdminRole();
  const [data, setData] = useState<AdminAccountBilling | null>(null);
  const [error, setError] = useState<string>();
  // Read once: the clock must not be read during render.
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    api.get<AdminAccountBilling>(`/admin/accounts/${accountId}/billing`).then(
      (d) => {
        setData(d);
        setError(undefined);
      },
      (err: unknown) => setError(err instanceof ApiError && err.message ? err.message : "Couldn't load their billing."),
    );
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!data) return <p className={styles.muted}>Loading…</p>;

  const { account, subscription: sub } = data;
  const canChange = role === 'super' && sub !== null && !['canceled', 'incomplete_expired'].includes(sub.status);
  const tier = account.org_tier && account.org_tier !== 'custom' ? ORG_TIERS[account.org_tier as FixedOrgTier] : null;

  return (
    <div className={styles.form}>
      <section aria-label="Plan" className={local.section}>
        <h3 className={styles.subheading}>Plan</h3>
        {account.kind === 'agency' && account.org_tier ? (
          <p>
            Organization plan: {tier ? tier.label : 'Custom'}
            {account.seat_limit ? `, ${account.seat_limit.toLocaleString('en-US')} Primary Users` : ''}
          </p>
        ) : null}
        {account.comp_until && account.comp_until > now ? <p>Free access until {day(account.comp_until)}.</p> : null}
        {!data.stripe_enabled ? (
          <p className={styles.muted}>Payments are switched off on this server.</p>
        ) : !sub ? (
          <p className={styles.muted}>No subscription. They are on a trial or free access.</p>
        ) : (
          <dl className={local.facts}>
            <dt>Status</dt>
            <dd>{statusWords(sub)}</dd>
            <dt>Price</dt>
            <dd>{sub.amount === null ? 'Unknown' : `${money(sub.amount, sub.currency)} ${per(sub.interval)}`}</dd>
            <dt>{sub.cancel_at_period_end || sub.status === 'canceled' ? 'Ends' : 'Renews'}</dt>
            <dd>{day(sub.current_period_end) || 'Unknown'}</dd>
            <dt>Pays by</dt>
            <dd>{sub.collection_method === 'send_invoice' ? 'Invoice' : 'Card'}</dd>
            <dt>Billing email</dt>
            <dd className={local.wrap}>{sub.customer_email ?? 'Not set'}</dd>
          </dl>
        )}
        {sub ? (
          <a href={`https://dashboard.stripe.com/subscriptions/${sub.id}`} target="_blank" rel="noreferrer" className={local.link}>
            Open in Stripe
          </a>
        ) : null}
      </section>

      {sub ? (
        <section aria-label="Discount" className={local.section}>
          <h3 className={styles.subheading}>Discount</h3>
          <p>{discountWords(sub.discount)}</p>
        </section>
      ) : null}

      {canChange && sub ? (
        <>
          {data.plan_options.length > 0 ? <ChangePlan sub={sub} options={data.plan_options} onDone={load} /> : null}
          <DiscountForm sub={sub} onDone={load} />
          <CancelForm sub={sub} onDone={load} />
        </>
      ) : null}

      {data.invoices.length > 0 ? (
        <section aria-label="Invoices" className={local.section}>
          <h3 className={styles.subheading}>Invoices</h3>
          <ul className={local.list}>
            {data.invoices.map((i) => (
              <li key={i.id} className={local.invoice}>
                <span>
                  <strong>{i.number ?? 'Invoice'}</strong> · {day(i.created)}
                </span>
                <span>
                  {i.status === 'paid' ? money(i.amount_paid, i.currency) : `${money(i.amount_due, i.currency)} due`} · {INVOICE_WORDS[i.status] ?? i.status}
                </span>
                <span className={styles.actions}>
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noreferrer" className={local.link}>
                      View
                    </a>
                  ) : null}
                  {i.pdf ? (
                    <a href={i.pdf} target="_blank" rel="noreferrer" className={local.link}>
                      PDF
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A small form whose button first shows exactly what will happen, then does it. */
function Confirmed({
  title,
  children,
  ready,
  summary,
  action,
  danger,
  run,
  onDone,
}: {
  title: string;
  children: ReactNode;
  ready: boolean;
  summary: string;
  action: string;
  danger?: boolean;
  run: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function go(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await run();
      toast('Done');
      setConfirming(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={title} className={local.section}>
      <h3 className={styles.subheading}>{title}</h3>
      {confirming ? (
        <div className={local.confirm} role="group" aria-label={`Confirm: ${title}`}>
          <p>{summary}</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => void go()}>
              {action}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <>
          {children}
          <Button variant="secondary" disabled={!ready} onClick={() => setConfirming(true)}>
            Review
          </Button>
        </>
      )}
    </section>
  );
}

function ChangePlan({ sub, options, onDone }: { sub: Sub; options: AdminPlanOption[]; onDone: () => void }) {
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const picked = options.find((o) => o.price_id === price);
  return (
    <Confirmed
      title="Change plan"
      ready={Boolean(picked) && price !== sub.price_id}
      summary={picked ? `Move them to ${planLabel(picked)}. Stripe charges or credits the difference now.` : ''}
      action="Change plan"
      run={() => api.post(`/admin/subscriptions/${sub.id}/plan`, { price_id: price, note: note.trim() })}
      onDone={onDone}
    >
      <fieldset className={local.radios}>
        <legend className={local.legend}>Move to</legend>
        {options.map((o) => (
          <label key={o.price_id} className={local.radio}>
            <input type="radio" name={`plan-${sub.id}`} value={o.price_id} checked={price === o.price_id} disabled={o.price_id === sub.price_id} onChange={() => setPrice(o.price_id)} />
            <span>
              {planLabel(o)}
              {o.price_id === sub.price_id ? <span className={styles.muted}> (their plan now)</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <TextField label="Note for the activity log (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
    </Confirmed>
  );
}

const HOW_LONG = [
  { value: '1', label: '1 month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: 'always', label: 'Always' },
];

function DiscountForm({ sub, onDone }: { sub: Sub; onDone: () => void }) {
  const [percent, setPercent] = useState('');
  const [long, setLong] = useState('3');
  const [note, setNote] = useState('');
  const n = Number(percent);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;
  const months = long === 'always' ? null : Number(long);
  return (
    <>
      <Confirmed
        title="Give a discount"
        ready={valid}
        summary={`${n}% off ${months === null ? 'for as long as they subscribe' : `for ${months} month${months === 1 ? '' : 's'}`}. This replaces any discount they have.`}
        action="Give the discount"
        run={() => api.post(`/admin/subscriptions/${sub.id}/discount`, { percent_off: n, months, note: note.trim() })}
        onDone={onDone}
      >
        <TextField
          label="Percent off"
          inputMode="numeric"
          value={percent}
          maxLength={3}
          error={percent && !valid ? 'A whole number from 1 to 100' : undefined}
          onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ''))}
        />
        <Segmented label="For how long" value={long} onChange={setLong} items={HOW_LONG} />
        <TextField label="Note for the activity log (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Confirmed>
      {sub.discount ? (
        <Confirmed
          title="Remove the discount"
          ready
          summary={`Remove ${discountWords(sub.discount)}. Their next payment is the full price.`}
          action="Remove it"
          danger
          run={() => api.delete(`/admin/subscriptions/${sub.id}/discount`)}
          onDone={onDone}
        >
          <p className={styles.muted}>Their next payment goes back to the full price.</p>
        </Confirmed>
      ) : null}
    </>
  );
}

function CancelForm({ sub, onDone }: { sub: Sub; onDone: () => void }) {
  const [when, setWhen] = useState<'end' | 'now'>('end');
  const [note, setNote] = useState('');
  if (sub.cancel_at_period_end) return null;
  return (
    <Confirmed
      title="Cancel"
      ready
      summary={
        when === 'end'
          ? `It ends on ${day(sub.current_period_end)}. They keep everything until then and are not charged again.`
          : 'It ends right now and they are not refunded. Refund a payment from the Payments page if they should be.'
      }
      action="Cancel subscription"
      danger
      run={() => api.post(`/admin/subscriptions/${sub.id}/cancel`, { at_period_end: when === 'end', note: note.trim() })}
      onDone={onDone}
    >
      <Segmented
        label="When"
        value={when}
        onChange={(v) => setWhen(v as 'end' | 'now')}
        items={[
          { value: 'end', label: 'At the end of the paid period' },
          { value: 'now', label: 'Right now, no refund' },
        ]}
      />
      <TextField label="Note for the activity log (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
    </Confirmed>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminChargesPage, AdminInsights, AdminSubscription } from '@chipperly/shared/schemas/admin';
import { api, ApiError } from '@/lib/api/client';
import { canAct, useAdminRole } from '@/lib/admin/role';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { money, NOT_TEAM } from './format';
import { lastMonths } from './months';
import styles from './AdminDashboard.module.css';
import g from './GrowthPanel.module.css';

const DAY_MS = 86_400_000;
const LIVE = ['active', 'trialing'];
const PER_YEAR: Record<string, number> = { month: 12, year: 1, week: 52, day: 365 };

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString([], { month: 'short', timeZone: 'UTC' });
const monthLong = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "today", "tomorrow", "in 3 days" */
function inDays(ms: number, now: number): string {
  const days = Math.ceil((ms - now) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

function ago(ms: number | null, now: number): string {
  if (ms === null) return 'Never';
  const days = Math.floor((now - ms) / DAY_MS);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

type Series = { name: string; color: string; values: number[] };

/**
 * Bars per month, one or two series side by side, on one zero-based scale. SVG
 * for the bars (they stretch to the width), plain text for labels so they stay
 * readable on a phone, a <title> per bar for hover, and a table for exact numbers.
 */
function MonthBars({ title, months, series, format }: { title: string; months: string[]; series: Series[]; format: (n: number) => string }) {
  const peak = Math.max(1, ...series.flatMap((s) => s.values));
  const slot = 100 / months.length;
  const barW = (slot - 2) / series.length;
  const summary = `${title}, last 12 months. ${series.map((s) => `${s.name}: highest ${format(Math.max(0, ...s.values))}`).join('. ')}.`;
  return (
    <figure className={g.figure}>
      {series.length > 1 ? (
        <div className={g.legend}>
          {series.map((s) => (
            <span key={s.name} className={g.legendItem}>
              <span className={g.swatch} style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <p className={g.peak}>{format(peak)}</p>
      <svg className={g.plot} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={summary}>
        <line x1="0" y1="100" x2="100" y2="100" className={g.baseline} vectorEffect="non-scaling-stroke" />
        {months.map((m, i) =>
          series.map((s, j) => {
            const v = s.values[i] ?? 0;
            const h = (v / peak) * 96;
            return (
              <rect key={`${m}-${s.name}`} x={i * slot + 1 + j * barW} y={100 - h} width={Math.max(barW - 0.4, 0.5)} height={Math.max(h, v > 0 ? 1 : 0)} fill={s.color}>
                <title>{`${monthLong(m)}, ${s.name.toLowerCase()}: ${format(v)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className={g.months} aria-hidden="true">
        {months.map((m) => (
          <span key={m}>{monthLabel(m)}</span>
        ))}
      </div>
      <details className={g.numbers}>
        <summary>Show the numbers</summary>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {series.map((s) => (
                  <th key={s.name} scope="col">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => {
                const i = months.indexOf(m);
                return (
                  <tr key={m}>
                    <td data-label="Month">{monthLong(m)}</td>
                    {series.map((s) => (
                      <td key={s.name} data-label={s.name}>
                        {format(s.values[i] ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {note ? <span className={styles.muted}>{note}</span> : null}
    </div>
  );
}

/** Trials ending this week, how many trials became paying, and money and subscriptions over the last 12 months. */
export function GrowthPanel() {
  const role = useAdminRole();
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [subs, setSubs] = useState<{ enabled: boolean; subscriptions: AdminSubscription[] } | null>(null);
  const [charges, setCharges] = useState<AdminChargesPage | null>(null);
  const [failed, setFailed] = useState(false);
  // Read once: the clock must not be read during render.
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    api.get<AdminInsights>('/admin/insights').then(setInsights, () => setFailed(true));
    // Money comes straight from Stripe and can be slower; the page shows without it first.
    api.get<{ enabled: boolean; subscriptions: AdminSubscription[] }>('/admin/subscriptions').then(setSubs, () => setSubs({ enabled: false, subscriptions: [] }));
    api.get<AdminChargesPage>('/admin/charges').then(setCharges, () => setCharges({ enabled: false, charges: [], months: [] }));
  }, []);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load the numbers. Try Refresh.</p>;
  if (!insights) return null;

  async function extend(userId: string, name: string): Promise<void> {
    try {
      await api.post(`/admin/users/${userId}/extend-trial`, { days: 7 });
      toast(`Added 7 days to ${name}'s trial`);
      load();
    } catch (err) {
      toast(err instanceof ApiError && err.message ? err.message : "Couldn't extend the trial.");
    }
  }

  function copy(email: string): void {
    void navigator.clipboard.writeText(email).then(
      () => toast('Email copied'),
      () => toast("Couldn't copy. Select the email and copy it."),
    );
  }

  // ponytail: everything is sold in usd today; other currencies are left out of these sums until one is sold.
  const active = (subs?.subscriptions ?? []).filter((s) => LIVE.includes(s.status) && s.currency === 'usd');
  const mrr = active.reduce((sum, s) => sum + ((s.amount ?? 0) * (PER_YEAR[s.interval ?? ''] ?? 0)) / 12, 0);
  const tried = insights.paying_accounts + insights.trials_ended;
  const rate = tried > 0 ? `${Math.round((insights.paying_accounts / tried) * 100)}%` : '–';

  const months = lastMonths(new Date(now));
  const revenue = months.map((m) => {
    const row = charges?.months.find((r) => r.month === m && r.currency === 'usd');
    return row ? row.paid - row.refunded : 0;
  });
  const inMonth = (ms: number | null, m: string) => ms !== null && new Date(ms).toISOString().slice(0, 7) === m;
  const started = months.map((m) => (subs?.subscriptions ?? []).filter((s) => inMonth(s.created, m)).length);
  const ended = months.map((m) => (subs?.subscriptions ?? []).filter((s) => inMonth(s.canceled_at, m)).length);
  const stripeOff = (subs && !subs.enabled) || (charges && !charges.enabled);

  return (
    <div className={styles.page} data-wide>
      <div className={styles.headRow}>
        <p className={styles.muted}>Paying customers, trials, and money over time.</p>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className={styles.stats}>
        <Stat value={subs ? money(mrr) : '…'} label="Monthly revenue" note="From active plans" />
        <Stat value={subs ? money(mrr * 12) : '…'} label="Yearly run rate" />
        <Stat value={String(insights.active_subscriptions)} label="Paying now" />
        <Stat value={rate} label="Trials that paid" note={tried > 0 ? `${insights.paying_accounts} of ${tried} finished trials` : 'No trials have ended yet'} />
        <Stat value={String(insights.comp_accounts)} label="Free access" note="Given by hand" />
      </div>

      <section className={styles.card} aria-label="Trials ending in the next 7 days">
        <h2 className={styles.heading}>Trials ending in the next 7 days</h2>
        {insights.trials_ending.length === 0 ? (
          <p className={styles.muted}>No trials end in the next 7 days.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Trial ends</th>
                  <th scope="col">Last seen</th>
                  <th scope="col">Profiles</th>
                  <th scope="col">Accounts</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {insights.trials_ending.map((t) => (
                  <tr key={t.user_id}>
                    <td data-label="Person">
                      <div className={styles.cellStack}>
                        <span className={styles.name}>{t.display_name}</span>
                        <span className={styles.muted}>{t.email}</span>
                      </div>
                    </td>
                    <td data-label="Trial ends" className={styles.nowrap}>
                      {inDays(t.trial_ends_at, now)}, {new Date(t.trial_ends_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </td>
                    <td data-label="Last seen">{ago(t.last_seen_at, now)}</td>
                    <td data-label="Profiles">{t.profiles}</td>
                    <td data-label="Accounts">{t.accounts.map((a) => a.name).join(', ') || 'None yet'}</td>
                    <td data-label="">
                      <div className={styles.actions}>
                        {canAct(role) ? (
                          <Button variant="secondary" onClick={() => void extend(t.user_id, t.display_name)}>
                            +7 days
                          </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => copy(t.email)}>
                          Copy email
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stripeOff ? (
        <p className={styles.muted}>Payments are switched off on this server.</p>
      ) : (
        <>
          <section className={styles.card} aria-label="Money in each month">
            <h2 className={styles.heading}>Money in each month</h2>
            <p className={styles.muted}>Payments that went through, minus refunds{charges ? '' : ' (loading…)'}.</p>
            {charges ? <MonthBars title="Money in each month" months={months} format={(n) => money(n)} series={[{ name: 'Money in', color: 'var(--color-primary)', values: revenue }]} /> : null}
          </section>

          <section className={styles.card} aria-label="New and cancelled subscriptions">
            <h2 className={styles.heading}>New and cancelled subscriptions</h2>
            {subs ? (
              <MonthBars
                title="New and cancelled subscriptions"
                months={months}
                format={(n) => String(n)}
                series={[
                  { name: 'New', color: 'var(--color-primary)', values: started },
                  { name: 'Cancelled', color: 'var(--color-accent)', values: ended },
                ]}
              />
            ) : (
              <p className={styles.muted}>Loading…</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

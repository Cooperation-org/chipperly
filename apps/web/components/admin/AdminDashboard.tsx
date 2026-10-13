'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminInsights } from '@chipperly/shared/schemas/admin';
import type { AdminOverview, AdminUser, PromoCode } from '@chipperly/shared/schemas/billing';
import { api } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { trialDaysLeft } from '@/lib/billing/promo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { PromoCodeSheet } from './PromoCodeSheet';
import { PersonSheet } from './PersonSheet';
import styles from './AdminDashboard.module.css';
import { csvName, downloadCsv, toCsv } from './csv';
import { weekOverWeek } from './weeks';

/** Plural label per account kind, for the counts line. Unknown kinds read as individuals. */
const KIND_LABELS: Record<string, string> = {
  household: 'families',
  agency: 'organizations',
  supported: 'supported accounts',
  individual: 'individuals',
};

function day(ms: number): string {
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortDay(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function ago(ms: number | null): string {
  if (ms === null) return 'never';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Today's numbers, the People list, and the early access offers: one page each. */
export function AdminDashboard({ show }: { show: 'today' | 'people' | 'offers' }) {
  const role = useAdminRole();
  const canChange = role === 'super';
  const sheet = useSheet();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [people, setPeople] = useState<AdminUser[] | null>(null);
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [failed, setFailed] = useState(false);
  // A name clicked elsewhere in the admin arrives as ?q=.
  const [query, setQuery] = useState(() => (typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('q') ?? '')));

  const loadCodes = useCallback(() => {
    api.get<{ codes: PromoCode[] }>('/admin/promo-codes').then(
      (r) => setCodes(r.codes),
      () => setFailed(true),
    );
  }, []);
  const loadPeople = useCallback((q: string) => {
    api.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`).then(
      (r) => {
        setPeople(r.users);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);
  const loadToday = useCallback(() => {
    api.get<AdminOverview>('/admin/overview').then(
      (r) => {
        setOverview(r);
        setFailed(false);
      },
      () => setFailed(true),
    );
    // Paying customers is a nice-to-have here; Growth has it in full.
    api.get<AdminInsights>('/admin/insights').then(setInsights, () => undefined);
  }, []);

  useEffect(() => {
    if (!role) return;
    if (show === 'today') loadToday();
    else loadCodes();
  }, [role, show, loadToday, loadCodes]);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (!role || show !== 'people') return;
    const t = setTimeout(() => loadPeople(query), 250);
    return () => clearTimeout(t);
  }, [query, role, show, loadPeople]);

  if (!role) return <p className={styles.muted}>This page is for Chipperly&rsquo;s own team.</p>;

  const offers = (codes ?? []).filter((c) => c.active);

  function editCode(code: PromoCode | null): void {
    sheet.open(
      <PromoCodeSheet
        code={code}
        onSaved={() => {
          sheet.close();
          loadCodes();
        }}
      />,
      { title: code ? `Edit ${code.code}` : 'New offer' },
    );
  }

  function manage(person: AdminUser): void {
    sheet.open(
      <PersonSheet
        person={person}
        offers={offers}
        onChanged={() => {
          loadPeople(query);
          loadCodes();
        }}
        onClose={() => sheet.close()}
      />,
      { title: person.display_name },
    );
  }

  const retry = () => (show === 'today' ? loadToday() : show === 'people' ? loadPeople(query) : loadCodes());
  const failure = failed ? (
    <div className={styles.headRow} role="alert">
      <p className={styles.error}>Couldn&rsquo;t load this. Check your connection, then try again.</p>
      <Button variant="secondary" onClick={retry}>
        Try again
      </Button>
    </div>
  ) : null;

  if (show === 'today') {
    if (!overview) return failure;
    const peak = Math.max(1, ...overview.signups_by_day.map((d) => d.count));
    const { thisWeek, lastWeek } = weekOverWeek(overview.signups_by_day);
    const first = overview.signups_by_day[0]?.day;
    const last = overview.signups_by_day.at(-1)?.day;
    return (
      <div className={styles.page} data-wide>
        {failure}
        <div className={styles.stats}>
          {insights ? <Stat label="Paying now" value={insights.active_subscriptions} note={`${insights.comp_accounts} with free access`} /> : null}
          <Stat label="Signed up this week" value={thisWeek} note={`${lastWeek} the week before`} />
          <Stat label="Active this week" value={overview.active_7d} note={`of ${overview.users} people`} />
          <Stat label="On trial" value={overview.trials_active} note={`${overview.trials_ended} trials ended`} />
          <Stat label="Profiles" value={overview.children} note="people being supported" />
        </div>

        <section className={styles.card} aria-label="Sign-ups, last 30 days">
          <h2 className={styles.heading}>Sign-ups, last 30 days: {overview.signups_30d}</h2>
          <div className={styles.chart}>
            {overview.signups_by_day.map((d) => (
              <div key={d.day} className={styles.barSlot} title={`${d.day}: ${d.count}`}>
                <div className={styles.bar} style={{ height: `${(d.count / peak) * 100}%` }} />
              </div>
            ))}
          </div>
          {first && last ? (
            <div className={styles.chartAxis}>
              <span>{shortDay(first)}</span>
              <span>Busiest day: {peak}</span>
              <span>{shortDay(last)}</span>
            </div>
          ) : null}
          <p className={styles.muted}>
            {Object.entries(overview.accounts_by_kind)
              .map(([kind, n]) => `${n} ${KIND_LABELS[kind] ?? 'individuals'}`)
              .join(' · ') || 'No accounts yet'}
            {overview.promo_claims ? ` · ${overview.promo_claims} early access codes given` : ''}
          </p>
        </section>
      </div>
    );
  }

  if (show === 'offers') {
    return (
      <div className={styles.page} data-wide>
        {failure}
        <section className={styles.card} aria-label="Early access offers">
          <div className={styles.headRow}>
            <h2 className={styles.heading}>Early access offers</h2>
            {canChange ? (
              <Button variant="secondary" onClick={() => editCode(null)}>
                New offer
              </Button>
            ) : null}
          </div>
          <p className={styles.muted}>
            Nobody types these. Each person gets their own code under an offer, used once their trial ends. To give one person a code, open them on People.
          </p>
          {codes?.length === 0 ? <p className={styles.muted}>No offers yet.</p> : null}
          {codes?.map((c) => (
            <button key={c.code} type="button" className={styles.codeRow} disabled={!canChange} onClick={() => editCode(c)}>
              <span className={styles.code}>{c.code}</span>
              <span>{c.percent_off ? `${c.percent_off}% off ${c.applies_to === 'annual' ? 'annual' : 'any plan'}` : 'Discount not set'}</span>
              <span className={styles.muted}>
                {c.auto_issue ? 'Everyone who signs up ' : 'Given by hand, '}
                {day(c.valid_from)} to {day(c.valid_until)} · {c.issued} code{c.issued === 1 ? '' : 's'} given{c.active ? '' : ' · off'}
              </span>
            </button>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page} data-wide>
      <section className={styles.card} aria-label="People">
        <div className={styles.headRow}>
          <TextField label="Search name, email or family" value={query} onChange={(e) => setQuery(e.target.value)} />
          {people && people.length > 0 ? (
            <Button variant="secondary" onClick={() => downloadPeople(people)}>
              Download CSV
            </Button>
          ) : null}
        </div>
        {failure}
        {people && people.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Accounts</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Profiles</th>
                  <th scope="col">Devices</th>
                  <th scope="col">Seen</th>
                  <th scope="col">Trial</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const left = trialDaysLeft(p.trial_ends_at);
                  return (
                    <tr key={p.id}>
                      <td className={styles.lead} data-label="Person">
                        <div className={styles.cellStack}>
                          <span className={styles.name}>{p.display_name}</span>
                          <span className={styles.muted}>{p.email}</span>
                          {p.email_verified ? null : <span className={styles.muted}>Email not verified</span>}
                          {p.deactivated_at ? <span className={styles.closed}>Sign-in closed {day(p.deactivated_at)}</span> : null}
                        </div>
                      </td>
                      <td data-label="Accounts">
                        <div className={styles.cellStack}>
                          {p.accounts.map((a) => (
                            <span key={a.id}>
                              {a.name} <span className={styles.muted}>({a.kind})</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td data-label="Joined" className={styles.nowrap}>
                        {day(p.created_at)}
                      </td>
                      <td data-label="Profiles">{p.children}</td>
                      <td data-label="Devices">{p.devices}</td>
                      <td data-label="Seen" className={styles.nowrap}>
                        {ago(p.last_seen_at)}
                      </td>
                      <td data-label="Trial">
                        {left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'Ended'}
                        {p.personal_code ? ` · ${p.personal_code}` : ''}
                      </td>
                      <td data-label="" className={styles.rowActions}>
                        <Button variant="secondary" onClick={() => manage(p)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {people?.length === 0 ? <p className={styles.muted}>Nobody matches.</p> : null}
      </section>
    </div>
  );
}

/** The people shown (search applies), for a spreadsheet. */
function downloadPeople(people: AdminUser[]): void {
  downloadCsv(
    csvName('people'),
    toCsv(
      ['Name', 'Email', 'Email verified', 'Joined', 'Accounts', 'Profiles', 'Devices', 'Last seen', 'Trial ends', 'Early access code', 'Sign-in closed'],
      people.map((p) => [
        p.display_name,
        p.email,
        p.email_verified ? 'yes' : 'no',
        day(p.created_at),
        p.accounts.map((a) => `${a.name} (${a.kind})`).join('; '),
        p.children,
        p.devices,
        p.last_seen_at === null ? '' : day(p.last_seen_at),
        day(p.trial_ends_at),
        p.personal_code ?? '',
        p.deactivated_at === null ? '' : day(p.deactivated_at),
      ]),
    ),
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {note ? <span className={styles.statLabel}>{note}</span> : null}
    </div>
  );
}

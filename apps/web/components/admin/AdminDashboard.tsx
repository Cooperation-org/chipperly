'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminOverview, AdminUser, PromoCode } from '@chipperly/shared/schemas/billing';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { trialDaysLeft } from '@/lib/billing/promo';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { PromoCodeSheet } from './PromoCodeSheet';
import styles from './AdminDashboard.module.css';

function day(ms: number): string {
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function ago(ms: number | null): string {
  if (ms === null) return 'never';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Super admins only (the server's SUPER_ADMIN_EMAILS): sign-ups, trials, early access codes. */
export function AdminDashboard() {
  const { user } = useSession();
  const sheet = useSheet();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [people, setPeople] = useState<AdminUser[] | null>(null);
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [query, setQuery] = useState('');

  const loadCodes = useCallback(() => {
    void api.get<{ codes: PromoCode[] }>('/admin/promo-codes').then((r) => setCodes(r.codes));
  }, []);
  const loadPeople = useCallback((q: string) => {
    void api.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`).then((r) => setPeople(r.users));
  }, []);

  useEffect(() => {
    if (!user?.is_super_admin) return;
    void api.get<AdminOverview>('/admin/overview').then(setOverview);
    loadCodes();
  }, [user?.is_super_admin, loadCodes]);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (!user?.is_super_admin) return;
    const t = setTimeout(() => loadPeople(query), 250);
    return () => clearTimeout(t);
  }, [query, user?.is_super_admin, loadPeople]);

  if (!user?.is_super_admin) return <p className={styles.muted}>This page is for Chipperly&rsquo;s own team.</p>;

  async function extend(person: AdminUser, days: number): Promise<void> {
    try {
      await api.post(`/admin/users/${person.id}/extend-trial`, { days });
      toast(`Added ${days} days to ${person.display_name}'s trial`);
      loadPeople(query);
    } catch {
      toast("Couldn't extend the trial.");
    }
  }

  const offers = (codes ?? []).filter((c) => c.active);

  async function issue(person: AdminUser): Promise<void> {
    // ponytail: the first active offer; a picker once there's more than one running at a time.
    const offer = offers[0];
    if (!offer) return;
    try {
      const { code } = await api.post<{ code: string }>(`/admin/users/${person.id}/issue-code`, { offer: offer.code });
      toast(`Gave ${person.display_name} ${code}`);
      loadPeople(query);
      loadCodes();
    } catch {
      toast("Couldn't give a code.");
    }
  }

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

  const peak = Math.max(1, ...(overview?.signups_by_day.map((d) => d.count) ?? [1]));

  return (
    <div className={styles.page}>
      {overview ? (
        <>
          <div className={styles.stats}>
            <Stat label="People" value={overview.users} />
            <Stat label="Signed up, 7 days" value={overview.signups_7d} />
            <Stat label="Signed up, 30 days" value={overview.signups_30d} />
            <Stat label="Active, 7 days" value={overview.active_7d} />
            <Stat label="Children" value={overview.children} />
            <Stat label="On trial" value={overview.trials_active} />
            <Stat label="Trial ended" value={overview.trials_ended} />
            <Stat label="Early access codes given" value={overview.promo_claims} />
          </div>

          <section className={styles.card} aria-label="Sign-ups, last 30 days">
            <h2 className={styles.heading}>Sign-ups, last 30 days</h2>
            <div className={styles.chart}>
              {overview.signups_by_day.map((d) => (
                <div key={d.day} className={styles.barSlot} title={`${d.day}: ${d.count}`}>
                  <div className={styles.bar} style={{ height: `${(d.count / peak) * 100}%` }} />
                </div>
              ))}
            </div>
            <p className={styles.muted}>
              {Object.entries(overview.accounts_by_kind)
                .map(([kind, n]) => `${n} ${kind === 'household' ? 'families' : kind === 'agency' ? 'organizations' : 'individuals'}`)
                .join(' · ') || 'No accounts yet'}
            </p>
          </section>
        </>
      ) : null}

      <section className={styles.card} aria-label="Early access offers">
        <div className={styles.headRow}>
          <h2 className={styles.heading}>Early access offers</h2>
          <Button variant="secondary" onClick={() => editCode(null)}>
            New offer
          </Button>
        </div>
        <p className={styles.muted}>Nobody types these. Each person gets their own code under an offer, used once their trial ends.</p>
        {codes?.map((c) => (
          <button key={c.code} type="button" className={styles.codeRow} onClick={() => editCode(c)}>
            <span className={styles.code}>{c.code}</span>
            <span>{c.percent_off ? `${c.percent_off}% off ${c.applies_to === 'annual' ? 'annual' : 'any plan'}` : 'Discount not set'}</span>
            <span className={styles.muted}>
              {c.auto_issue ? 'Everyone who signs up ' : 'Given by hand, '}
              {day(c.valid_from)} to {day(c.valid_until)} · {c.issued} code{c.issued === 1 ? '' : 's'} given{c.active ? '' : ' · off'}
            </span>
          </button>
        ))}
      </section>

      <section className={styles.card} aria-label="People">
        <h2 className={styles.heading}>People</h2>
        <TextField label="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        {people?.map((p) => {
          const left = trialDaysLeft(p.trial_ends_at);
          return (
            <div key={p.id} className={styles.person}>
              <div className={styles.personMain}>
                <span className={styles.name}>{p.display_name}</span>
                <span className={styles.muted}>{p.email}</span>
                <span className={styles.muted}>
                  Joined {day(p.created_at)} · {p.children} child{p.children === 1 ? '' : 'ren'} · {p.devices} device{p.devices === 1 ? '' : 's'} · seen{' '}
                  {ago(p.last_seen_at)}
                  {p.email_verified ? '' : ' · email not verified'}
                </span>
                <span>
                  {left > 0 ? `Trial: ${left} day${left === 1 ? '' : 's'} left` : 'Trial ended'}
                  {p.personal_code ? ` · ${p.personal_code}` : ''}
                </span>
              </div>
              <div className={styles.actions}>
                {!p.personal_code && offers.length > 0 ? (
                  <Button variant="secondary" onClick={() => void issue(p)}>
                    Give code
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => void extend(p, 7)}>
                  +7 days
                </Button>
                <Button variant="secondary" onClick={() => void extend(p, 21)}>
                  +21 days
                </Button>
              </div>
            </div>
          );
        })}
        {people?.length === 0 ? <p className={styles.muted}>Nobody matches.</p> : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

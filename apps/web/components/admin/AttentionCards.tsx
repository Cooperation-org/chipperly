'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminClientErrorGroup, AdminFailedPayment, AdminInsights, AdminWaitlistEntry } from '@chipperly/shared/schemas/admin';
import type { FeedbackList } from '@chipperly/shared/schemas/feedback';
import { useAdminRole } from '@/lib/admin/role';
import { api } from '@/lib/api/client';
import styles from './AttentionCards.module.css';

type Count = number | 'error' | null;

interface Card {
  key: string;
  /** For "Couldn't check {what}". */
  what: string;
  href: string;
  label: (n: number) => string;
  calm: string;
  load: () => Promise<number>;
}

const DAY = 24 * 60 * 60 * 1000;

const CARDS: Card[] = [
  {
    key: 'trials',
    what: 'trials',
    href: '/admin/growth/',
    label: (n) => `${n} trial${n === 1 ? '' : 's'} end this week`,
    calm: 'No trials end this week',
    load: async () => (await api.get<AdminInsights>('/admin/insights')).trials_ending.length,
  },
  {
    key: 'failed',
    what: 'payments',
    href: '/admin/failed-payments/',
    label: (n) => `${n} failed or overdue payment${n === 1 ? '' : 's'}`,
    calm: 'No failed payments',
    load: async () => (await api.get<{ items: AdminFailedPayment[] }>('/admin/failed-payments')).items.length,
  },
  {
    key: 'waitlist',
    what: 'the waitlist',
    href: '/admin/waitlist/',
    label: (n) => `${n} ${n === 1 ? 'person is' : 'people are'} waiting for a beta code`,
    calm: 'Nobody is waiting for a beta code',
    load: async () => (await api.get<{ entries: AdminWaitlistEntry[] }>('/admin/waitlist')).entries.filter((e) => !e.invited_at && !e.has_account).length,
  },
  {
    key: 'feedback',
    what: 'feedback',
    href: '/admin/feedback/',
    label: (n) => `${n} new feedback message${n === 1 ? '' : 's'}`,
    calm: 'No new feedback',
    load: async () => (await api.get<FeedbackList>('/admin/feedback')).items.filter((i) => i.status === 'new').length,
  },
  {
    key: 'errors',
    what: 'app errors',
    href: '/admin/errors/',
    label: (n) => `${n} app error${n === 1 ? '' : 's'} in the last day`,
    calm: 'No app errors in the last day',
    load: async () => {
      const since = Date.now() - DAY;
      return (await api.get<{ groups: AdminClientErrorGroup[] }>('/admin/client-errors')).groups.filter((g) => g.last_at > since).length;
    },
  },
];

/** The top of the Today page: what needs someone now, each a link to where it is done. Each card loads on its own. */
export function AttentionCards() {
  const role = useAdminRole();
  const [counts, setCounts] = useState<Record<string, Count>>({});

  useEffect(() => {
    if (!role) return;
    for (const card of CARDS) {
      card.load().then(
        (n) => setCounts((c) => ({ ...c, [card.key]: n })),
        () => setCounts((c) => ({ ...c, [card.key]: 'error' })),
      );
    }
  }, [role]);

  if (!role) return null;
  const busy = CARDS.filter((c) => typeof counts[c.key] === 'number' && (counts[c.key] as number) > 0);
  const loaded = CARDS.every((c) => counts[c.key] !== undefined);
  const failed = CARDS.some((c) => counts[c.key] === 'error');

  return (
    <section aria-label="Needs attention" className={styles.wrap}>
      <h2 className={styles.heading}>{loaded && busy.length === 0 && !failed ? 'All clear' : 'Needs attention'}</h2>
      <ul className={styles.list}>
        {CARDS.map((card) => {
          const n = counts[card.key];
          const tone = n === undefined ? 'loading' : n === 'error' ? 'error' : n === null || n === 0 ? 'calm' : 'act';
          return (
            <li key={card.key}>
              <Link href={card.href} className={styles.card} data-tone={tone}>
                <span className={styles.count} aria-hidden="true">
                  {tone === 'act' ? n : tone === 'calm' ? '✓' : tone === 'error' ? '!' : '…'}
                </span>
                <span className={styles.text}>
                  {n === undefined ? 'Checking…' : n === 'error' ? `Couldn't check ${card.what}` : n === 0 || n === null ? card.calm : card.label(n)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

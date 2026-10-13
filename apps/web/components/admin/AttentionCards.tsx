'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminClientErrorGroup, AdminFailedPayment, AdminInsights, AdminRole, AdminWaitlistEntry } from '@chipperly/shared/schemas/admin';
import { BackupListSchema, type BackupList } from '@chipperly/shared/schemas/backup';
import type { FeedbackList } from '@chipperly/shared/schemas/feedback';
import type { ModerationReport } from '@/lib/data/moderation';
import type { AdminSyncHealth } from '@chipperly/shared/schemas/syncHealth';
import { useAdminRole } from '@/lib/admin/role';
import { api } from '@/lib/api/client';
import { HELD_REASONS, syncVerdict } from './syncVerdict';
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
  /** Who sees it; everyone on Today when left out. */
  roles?: readonly AdminRole[];
}

const DAY = 24 * 60 * 60 * 1000;
/** A nightly backup older than this means last night's did not run. */
const BACKUP_LATE_MS = 36 * 60 * 60 * 1000;

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
  {
    key: 'moderation',
    what: 'reports',
    href: '/admin/moderation/',
    label: (n) => `${n} community report${n === 1 ? '' : 's'} to review`,
    calm: 'No community reports to review',
    load: async () => (await api.get<{ reports: ModerationReport[] }>('/community/moderation/reports?status=open')).reports.length,
  },
  {
    key: 'sync',
    what: 'sync health',
    href: '/admin/sync/',
    label: (n) => (n === 1 ? 'Sync health needs a look' : `${n} refused changes need you on Sync health`),
    calm: 'Everything phones wrote is saved',
    load: async () => {
      const health = await api.get<AdminSyncHealth>('/admin/sync-health');
      const verdict = syncVerdict(health, Date.now());
      if (verdict.tone === 'calm') return 0;
      return Math.max(1, health.rejections.filter((r) => r.resolved_at === null && !HELD_REASONS.has(r.reason)).length);
    },
    roles: ['super'],
  },
  {
    key: 'backups',
    what: 'backups',
    href: '/admin/backups/',
    label: () => "Last night's backup is missing",
    calm: "Last night's backup is there",
    load: async () => {
      const list = await api.get<BackupList>('/admin/backups', { schema: BackupListSchema });
      if (!list.enabled) return 0;
      const newest = Math.max(0, ...list.backups.map((b) => b.taken_at));
      return Date.now() - newest > BACKUP_LATE_MS ? 1 : 0;
    },
    roles: ['super'],
  },
];

/** The top of the Today page: what needs someone now, each a link to where it is done. Each card loads on its own. */
export function AttentionCards() {
  const role = useAdminRole();
  const [counts, setCounts] = useState<Record<string, Count>>({});

  useEffect(() => {
    if (!role) return;
    for (const card of CARDS.filter((c) => !c.roles || c.roles.includes(role))) {
      card.load().then(
        (n) => setCounts((c) => ({ ...c, [card.key]: n })),
        () => setCounts((c) => ({ ...c, [card.key]: 'error' })),
      );
    }
  }, [role]);

  if (!role) return null;
  const cards = CARDS.filter((c) => !c.roles || c.roles.includes(role));
  const busy = cards.filter((c) => typeof counts[c.key] === 'number' && (counts[c.key] as number) > 0);
  const loaded = cards.every((c) => counts[c.key] !== undefined);
  const failed = cards.some((c) => counts[c.key] === 'error');

  return (
    <section aria-label="Needs attention" className={styles.wrap}>
      <h2 className={styles.heading}>{loaded && busy.length === 0 && !failed ? 'All clear' : 'Needs attention'}</h2>
      <ul className={styles.list}>
        {cards.map((card) => {
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

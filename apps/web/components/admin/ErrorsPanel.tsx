'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminClientErrorGroup } from '@chipperly/shared/schemas/admin';
import { api } from '@/lib/api/client';
import { useAdminRole } from '@/lib/admin/role';
import { Button } from '@/components/ui/Button';
import { day, NOT_TEAM } from './format';
import styles from './AdminDashboard.module.css';
import own from './AdminExtras.module.css';

function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Errors browsers reported in the last 30 days, grouped by message. */
export function ErrorsPanel() {
  const role = useAdminRole();
  const [data, setData] = useState<{ groups: AdminClientErrorGroup[]; total: number; at: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api.get<{ groups: AdminClientErrorGroup[]; total: number }>('/admin/client-errors').then(
      (r) => {
        setData({ ...r, at: Date.now() });
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load the error reports.</p>;
  if (!data) return null;

  return (
    <div className={styles.page} data-wide>
      <div className={styles.headRow}>
        <p className={styles.muted}>Errors people&rsquo;s browsers hit in the last 30 days. Nothing here says who.</p>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>
      {data.groups.length === 0 ? (
        <section className={styles.card}>
          <p className={styles.muted}>No errors in the last 30 days.</p>
        </section>
      ) : (
        data.groups.map((g) => (
          <section key={g.message} className={styles.card} aria-label={g.message}>
            <h2 className={styles.heading}>{g.message}</h2>
            <p>
              <span className={styles.name}>
                {g.count} {g.count === 1 ? 'time' : 'times'}
              </span>
              <span className={styles.muted}>
                {' '}
                · last {ago(g.last_at, data.at)} · first {day(g.first_at)}
              </span>
            </p>
            {g.paths.length ? <p className={styles.muted}>Screens: {g.paths.join(', ')}</p> : null}
            {g.commits.length ? <p className={styles.muted}>Builds: {g.commits.join(', ')}</p> : null}
            <details>
              <summary className={own.summary}>Details</summary>
              {g.stack ? <pre className={own.pre}>{g.stack}</pre> : <p className={styles.muted}>No stack was sent.</p>}
              {g.user_agent ? <p className={styles.muted}>Browser: {g.user_agent}</p> : null}
            </details>
          </section>
        ))
      )}
    </div>
  );
}

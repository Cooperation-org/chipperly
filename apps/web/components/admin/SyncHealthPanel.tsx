'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminReplayResult, AdminSyncHealth, AdminSyncRejection } from '@chipperly/shared/schemas/syncHealth';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { PersonLink } from './PersonLink';
import { syncVerdict, HELD_REASONS, ORPHAN_OLD_MS } from './syncVerdict';
import styles from './AdminDashboard.module.css';

function when(ms: number | null): string {
  return ms === null ? '' : new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The server's and the device's reasons in plain words; anything else shows as it was sent. */
const REASON_WORDS: Record<string, string> = {
  locked: 'The phone was locked to the child view',
  lapsed: 'The free trial had ended',
  invalid: 'The server could not read it',
  forbidden: 'Not allowed for this person',
  no_profile: 'It names no person',
  left_on_device: 'Left on a phone someone else signed in to',
  signed_out: 'Left behind at sign-out',
};

const RESOLUTION_WORDS: Record<string, string> = {
  accepted_later: 'The phone sent it again and it saved',
  replayed: 'Saved by hand',
  superseded: 'A newer version was already saved',
  dismissed: 'Ignored',
};

const TABLE_WORDS: Record<string, string> = {
  schedule_items: 'Schedule item',
  step_completions: 'Ticked step',
  chip_ledger: 'Chips',
  activities: 'Activity',
  activity_steps: 'Activity step',
  rewards: 'Reward',
  locations: 'Place',
  profiles: 'Person settings',
  mood_events: 'Feeling',
  attitude_checks: 'Attitude check',
  day_plans: 'Day note',
  day_events: 'Event',
  social_stories: 'Story',
  story_pages: 'Story page',
  recurrence_skips: 'Skipped day',
};

/**
 * Super admins only: anything a phone saved that has not reached the server.
 * Opens on a verdict and what to do about it; each list shows only when it
 * has something in it.
 */
export function SyncHealthPanel() {
  const { user } = useSession();
  const [health, setHealth] = useState<AdminSyncHealth | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null);
  // Read on each load: the clock must not be read during render.
  const [now, setNow] = useState(0);

  const load = useCallback(() => {
    api.get<AdminSyncHealth>('/admin/sync-health').then(
      (r) => {
        setHealth(r);
        setNow(Date.now());
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [user?.is_super_admin, load]);

  if (!user?.is_super_admin) return <p className={styles.muted}>This page is for Chipperly&rsquo;s own team.</p>;
  if (failed)
    return (
      <div className={styles.headRow} role="alert">
        <p className={styles.error}>Couldn&rsquo;t load sync health.</p>
        <Button variant="secondary" onClick={load}>
          Try again
        </Button>
      </div>
    );
  if (!health) return null;

  async function replay(rejection: AdminSyncRejection): Promise<void> {
    setBusy(rejection.id);
    try {
      const result = await api.post<AdminReplayResult>(`/admin/sync-rejections/${rejection.id}/replay`);
      toast(result.ok ? (RESOLUTION_WORDS[result.result] ?? result.result) : `Still refused: ${REASON_WORDS[result.result] ?? result.result}`);
    } catch {
      toast("Couldn't save it.");
    }
    setBusy(null);
    load();
  }

  async function dismiss(rejection: AdminSyncRejection): Promise<void> {
    setBusy(rejection.id);
    await api.post(`/admin/sync-rejections/${rejection.id}/dismiss`).catch(() => toast("Couldn't ignore it."));
    setBusy(null);
    load();
  }

  async function show(rejection: AdminSyncRejection): Promise<void> {
    if (shown?.id === rejection.id) return setShown(null);
    const { payload } = await api.get<{ payload: unknown }>(`/admin/sync-rejections/${rejection.id}`).catch(() => ({ payload: null }));
    setShown({ id: rejection.id, text: JSON.stringify(payload, null, 2) });
  }

  const verdict = syncVerdict(health, now);
  const open = health.rejections.filter((r) => r.resolved_at === null);
  const needYou = open.filter((r) => !HELD_REASONS.has(r.reason));
  const held = open.filter((r) => HELD_REASONS.has(r.reason));
  const closed = health.rejections.filter((r) => r.resolved_at !== null);

  const checks = [
    needYou.length === 0 ? 'No refused changes' : null,
    health.devices.length === 0 ? 'No phones holding changes' : null,
    health.orphans.length === 0 ? 'No saved data missing its other half' : null,
  ].filter(Boolean);

  const rejectionTable = (rows: AdminSyncRejection[], withActions: boolean) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">What</th>
            <th scope="col">Why it was refused</th>
            {withActions ? <th scope="col">What to do</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="When">
                {when(r.created_at)}
                {r.seen_count > 1 ? <span className={styles.muted}> tried {r.seen_count} times</span> : null}
              </td>
              <td data-label="Who">
                <PersonLink q={r.user_email ?? r.account_name}>
                  <span className={styles.name}>{r.profile_name ?? 'Unknown person'}</span>
                </PersonLink>
                <span className={styles.muted}> {r.account_name ?? ''}</span>
              </td>
              <td data-label="What" title={r.row_id}>
                {TABLE_WORDS[r.table_name] ?? r.table_name}
                {r.op === 'delete' ? ' (removal)' : ''}
              </td>
              <td data-label="Why it was refused">{REASON_WORDS[r.reason] ?? r.reason}</td>
              {withActions ? (
                <td data-label="What to do">
                  <div className={styles.actions}>
                    {r.profile_id && (r.has_payload || r.op === 'delete') ? (
                      <Button variant="secondary" disabled={busy === r.id} onClick={() => void replay(r)}>
                        Save it anyway
                      </Button>
                    ) : null}
                    <Button variant="secondary" disabled={busy === r.id} onClick={() => void dismiss(r)}>
                      Ignore
                    </Button>
                    {r.has_payload ? (
                      <Button variant="ghost" onClick={() => void show(r)}>
                        {shown?.id === r.id ? 'Hide what was sent' : 'Show what was sent'}
                      </Button>
                    ) : null}
                  </div>
                  {shown?.id === r.id ? <pre className={styles.muted}>{shown.text}</pre> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.page} data-wide>
      <div className={styles.verdict} data-tone={verdict.tone} role={verdict.tone === 'act' ? 'alert' : 'status'}>
        <div className={styles.cellStack}>
          <strong>{verdict.title}</strong>
          <span>{verdict.next}</span>
          {checks.length > 0 ? <span className={styles.muted}>{checks.map((c) => `✓ ${c}`).join('  ·  ')}</span> : null}
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      {needYou.length > 0 ? (
        <section className={styles.card} aria-label="Changes the server refused">
          <h2 className={styles.heading}>Changes the server refused</h2>
          <p className={styles.muted}>
            Each one is kept, so nothing is lost yet. <strong>Save it anyway</strong> applies it as the phone sent it (unless something newer is already saved).{' '}
            <strong>Ignore</strong> drops it, for something that should not be saved.
          </p>
          {rejectionTable(needYou, true)}
        </section>
      ) : null}

      {held.length > 0 ? (
        <section className={styles.card} aria-label="Waiting to be sent again">
          <h2 className={styles.heading}>Waiting to be sent again</h2>
          <p className={styles.muted}>Refused for now because the phone was locked or the trial had ended. The phone sends these again by itself once that changes. Nothing to do.</p>
          {rejectionTable(held, false)}
        </section>
      ) : null}

      {health.devices.length > 0 ? (
        <section className={styles.card} aria-label="Phones holding changes">
          <h2 className={styles.heading}>Phones holding changes</h2>
          <p className={styles.muted}>
            Changes a phone has not sent yet, usually because it is offline. They go when it is back online. If a phone has been quiet for days, ask the family to open
            the app on it with internet on.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Whose</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Waiting</th>
                  <th scope="col">Oldest</th>
                  <th scope="col">Last heard from</th>
                </tr>
              </thead>
              <tbody>
                {health.devices.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Whose">
                      <PersonLink q={d.user_email}>{d.user_email ?? 'Unknown'}</PersonLink>
                    </td>
                    <td data-label="Phone" title={d.id}>
                      {d.name ?? d.platform}
                    </td>
                    <td data-label="Waiting">
                      {d.pending} to send{d.held > 0 ? `, ${d.held} held` : ''}
                      {d.dead > 0 ? `, ${d.dead} refused` : ''}
                    </td>
                    <td data-label="Oldest">{when(d.oldest_at)}</td>
                    <td data-label="Last heard from">{when(d.sync_reported_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {health.orphans.length > 0 ? (
        <section className={styles.card} aria-label="Saved data missing its other half">
          <h2 className={styles.heading}>Saved data missing its other half</h2>
          <p className={styles.muted}>
            For example, a step ticked on a day the server has no schedule for. The phone that made it usually sends the missing part the next time the app opens.
            Rows older than two days will not fill in by themselves: ask the family to open the app on the phone they use, and if they stay, tell the developer.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">How many</th>
                  <th scope="col">Since</th>
                </tr>
              </thead>
              <tbody>
                {health.orphans.map((o) => (
                  <tr key={`${o.profile_id}:${o.kind}`}>
                    <td data-label="Who">
                      <PersonLink q={o.account_name}>
                        <span className={styles.name}>{o.profile_name ?? 'Unknown person'}</span>
                      </PersonLink>
                      <span className={styles.muted}> {o.account_name ?? ''}</span>
                    </td>
                    <td data-label="What">{o.kind}</td>
                    <td data-label="How many">{o.count}</td>
                    <td data-label="Since">
                      {when(o.oldest_at)}
                      {now - o.oldest_at > ORPHAN_OLD_MS ? <span className={styles.closed}> stuck</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <details className={styles.card}>
          <summary className={styles.heading}>Dealt with ({closed.length})</summary>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Why it was refused</th>
                  <th scope="col">How it ended</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((r) => (
                  <tr key={r.id}>
                    <td data-label="When">{when(r.created_at)}</td>
                    <td data-label="Who">{r.profile_name ?? r.user_email ?? ''}</td>
                    <td data-label="What">{TABLE_WORDS[r.table_name] ?? r.table_name}</td>
                    <td data-label="Why it was refused">{REASON_WORDS[r.reason] ?? r.reason}</td>
                    <td data-label="How it ended">
                      {RESOLUTION_WORDS[r.resolution ?? ''] ?? r.resolution} {when(r.resolved_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminReplayResult, AdminSyncHealth, AdminSyncRejection } from '@chipperly/shared/schemas/syncHealth';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import styles from './AdminDashboard.module.css';

function when(ms: number | null): string {
  return ms === null ? '' : new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The server's and the device's reasons in plain words; anything else shows as it was sent. */
const REASON_WORDS: Record<string, string> = {
  locked: 'Device was locked to the child view',
  lapsed: 'Free trial had ended',
  invalid: 'The server could not read it',
  forbidden: 'Not allowed for this person',
  no_profile: 'Names no person',
  left_on_device: 'Left on a device someone else signed in to',
  signed_out: 'Left behind at sign-out',
};

const RESOLUTION_WORDS: Record<string, string> = {
  accepted_later: 'Saved later by the device',
  replayed: 'Put back by hand',
  superseded: 'A newer version was already saved',
  dismissed: 'Closed without applying',
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
 * Super admins only: every change a device made that is not on the server.
 * Three lists, each empty when all is well: writes the server refused (each
 * kept, and can be put back), devices still holding unsent writes, and rows
 * that point at something the server never received.
 */
export function SyncHealthPanel() {
  const { user } = useSession();
  const [health, setHealth] = useState<AdminSyncHealth | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(() => {
    api.get<AdminSyncHealth>('/admin/sync-health').then(
      (r) => {
        setHealth(r);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [user?.is_super_admin, load]);

  if (!user?.is_super_admin) return <p className={styles.muted}>This page is for Chipperly&rsquo;s own team.</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load sync health.</p>;
  if (!health) return null;

  async function replay(rejection: AdminSyncRejection): Promise<void> {
    setBusy(rejection.id);
    try {
      const result = await api.post<AdminReplayResult>(`/admin/sync-rejections/${rejection.id}/replay`);
      toast(result.ok ? (RESOLUTION_WORDS[result.result] ?? result.result) : `Still refused: ${REASON_WORDS[result.result] ?? result.result}`);
    } catch {
      toast("Couldn't put it back.");
    }
    setBusy(null);
    load();
  }

  async function dismiss(rejection: AdminSyncRejection): Promise<void> {
    setBusy(rejection.id);
    await api.post(`/admin/sync-rejections/${rejection.id}/dismiss`).catch(() => toast("Couldn't close it."));
    setBusy(null);
    load();
  }

  async function show(rejection: AdminSyncRejection): Promise<void> {
    if (shown?.id === rejection.id) return setShown(null);
    const { payload } = await api.get<{ payload: unknown }>(`/admin/sync-rejections/${rejection.id}`).catch(() => ({ payload: null }));
    setShown({ id: rejection.id, text: JSON.stringify(payload, null, 2) });
  }

  const open = health.rejections.filter((r) => r.resolved_at === null);
  const closed = health.rejections.filter((r) => r.resolved_at !== null);

  return (
    <div className={styles.page} data-wide>
      <div className={styles.headRow}>
        <p className={health.attention ? styles.error : styles.muted} role={health.attention ? 'alert' : undefined}>
          {health.attention ? 'Something a device wrote is not saved. See below.' : 'Everything devices have written is saved.'}
        </p>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <section className={styles.card} aria-label="Refused changes">
        <h2 className={styles.heading}>Refused changes</h2>
        <p className={styles.muted}>
          Changes the server would not take. Each is kept here with what it said. A locked device sends its own again after it is unlocked; the rest wait for you.
        </p>
        {open.length === 0 ? (
          <p className={styles.muted}>None open.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Why</th>
                  <th scope="col">Do</th>
                </tr>
              </thead>
              <tbody>
                {open.map((r) => (
                  <tr key={r.id}>
                    <td data-label="When">
                      {when(r.created_at)}
                      {r.seen_count > 1 ? <span className={styles.muted}> tried {r.seen_count} times</span> : null}
                    </td>
                    <td data-label="Who">
                      <span className={styles.name}>{r.profile_name ?? 'Unknown person'}</span>
                      <span className={styles.muted}> {r.account_name ?? ''} {r.user_email ?? ''}</span>
                    </td>
                    <td data-label="What" title={r.row_id}>
                      {TABLE_WORDS[r.table_name] ?? r.table_name}
                      {r.op === 'delete' ? ' (removal)' : ''}
                    </td>
                    <td data-label="Why">{REASON_WORDS[r.reason] ?? r.reason}</td>
                    <td data-label="Do">
                      <div className={styles.actions}>
                        {r.has_payload ? (
                          <Button variant="secondary" onClick={() => void show(r)}>
                            {shown?.id === r.id ? 'Hide' : 'Show'}
                          </Button>
                        ) : null}
                        {r.profile_id && (r.has_payload || r.op === 'delete') ? (
                          <Button variant="secondary" disabled={busy === r.id} onClick={() => void replay(r)}>
                            Put back
                          </Button>
                        ) : null}
                        <Button variant="secondary" disabled={busy === r.id} onClick={() => void dismiss(r)}>
                          Close
                        </Button>
                      </div>
                      {shown?.id === r.id ? <pre className={styles.muted}>{shown.text}</pre> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Devices holding changes">
        <h2 className={styles.heading}>Devices holding changes</h2>
        <p className={styles.muted}>What each device says it has not managed to send. A device that is simply offline shows here until it is back.</p>
        {health.devices.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Whose</th>
                  <th scope="col">Device</th>
                  <th scope="col">Waiting</th>
                  <th scope="col">Oldest</th>
                  <th scope="col">Last heard from</th>
                </tr>
              </thead>
              <tbody>
                {health.devices.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Whose">{d.user_email ?? ''}</td>
                    <td data-label="Device" title={d.id}>
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
        )}
      </section>

      <section className={styles.card} aria-label="Rows pointing at nothing">
        <h2 className={styles.heading}>Rows pointing at nothing</h2>
        <p className={styles.muted}>
          Saved rows whose parent never arrived, for example steps ticked on a day the server has no schedule for. The device that made them sends the missing
          part the next time it opens the app.
        </p>
        {health.orphans.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">How many</th>
                </tr>
              </thead>
              <tbody>
                {health.orphans.map((o) => (
                  <tr key={`${o.profile_id}:${o.kind}`}>
                    <td data-label="Who">
                      <span className={styles.name}>{o.profile_name ?? 'Unknown person'}</span>
                      <span className={styles.muted}> {o.account_name ?? ''}</span>
                    </td>
                    <td data-label="What">{o.kind}</td>
                    <td data-label="How many">{o.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {closed.length > 0 ? (
        <section className={styles.card} aria-label="Dealt with">
          <h2 className={styles.heading}>Dealt with</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Why</th>
                  <th scope="col">How it ended</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((r) => (
                  <tr key={r.id}>
                    <td data-label="When">{when(r.created_at)}</td>
                    <td data-label="Who">{r.profile_name ?? r.user_email ?? ''}</td>
                    <td data-label="What">{TABLE_WORDS[r.table_name] ?? r.table_name}</td>
                    <td data-label="Why">{REASON_WORDS[r.reason] ?? r.reason}</td>
                    <td data-label="How it ended">
                      {RESOLUTION_WORDS[r.resolution ?? ''] ?? r.resolution} {when(r.resolved_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

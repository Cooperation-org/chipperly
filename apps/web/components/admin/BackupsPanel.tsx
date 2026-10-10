'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BackupAccountPreviewSchema,
  BackupListSchema,
  BackupSummarySchema,
  RestoreAccountResultSchema,
  RestoreStatusSchema,
  type BackupAccount,
  type BackupAccountPreview,
  type BackupFile,
  type BackupList,
  type BackupSummary,
  type RestoreAccountResult,
  type RestoreStatus,
} from '@chipperly/shared/schemas/backup';
import { api, ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { accountRestoreSentence, sizeLabel, summaryDifferences, tableLabel } from '@/lib/admin/backupCopy';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import styles from './BackupsPanel.module.css';

function when(ms: number): string {
  return new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

const failure = (err: unknown, fallback: string): string => (err instanceof ApiError && err.message ? err.message : fallback);

const STATUS_WORD = { missing: 'Comes back', changed: 'Goes back to how it was', same: 'Already the same' } as const;

/** One account from one day: find it, see what a restore would do, then do it. */
function AccountRestore({ date }: { date: string }) {
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<BackupAccount[] | null>(null);
  const [preview, setPreview] = useState<BackupAccountPreview | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RestoreAccountResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const t = setTimeout(() => {
      void api
        .get<{ accounts: BackupAccount[] }>(`/admin/backups/${date}/accounts?q=${encodeURIComponent(query)}`)
        .then((r) => setAccounts(r.accounts))
        .catch((err: unknown) => setError(failure(err, "Couldn't read that backup.")));
    }, 300);
    return () => clearTimeout(t);
  }, [date, query]);

  async function open(account: BackupAccount): Promise<void> {
    setBusy(true);
    setError(undefined);
    setResult(null);
    setConfirm('');
    try {
      setPreview(await api.get<BackupAccountPreview>(`/admin/backups/${date}/accounts/${account.id}`, { schema: BackupAccountPreviewSchema, timeoutMs: 60_000 }));
    } catch (err) {
      setError(failure(err, "Couldn't read that account from the backup."));
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    if (!preview) return;
    setBusy(true);
    setError(undefined);
    try {
      const done = await api.post<RestoreAccountResult>(`/admin/backups/${date}/accounts/${preview.account.id}/restore`, { confirm }, { schema: RestoreAccountResultSchema, timeoutMs: 120_000 });
      setResult(done);
      toast(`Restored ${done.total} ${done.total === 1 ? 'row' : 'rows'}`);
      await open(preview.account);
    } catch (err) {
      setError(failure(err, "The restore didn't happen. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  if (preview) {
    const shown = preview.tables.filter((t) => t.in_backup + t.live > 0);
    const worth = preview.items.filter((i) => i.status !== 'same');
    return (
      <div className={styles.stack}>
        <Button variant="ghost" onClick={() => setPreview(null)}>
          Back to the list
        </Button>
        <h3 className={styles.heading}>{preview.account.name}</h3>
        <p className={styles.muted}>
          As it was on {date}. {preview.account.people.join(', ') || 'No people'}. Admins: {preview.account.admins.join(', ') || 'none'}.
          {preview.account.exists_now ? '' : ' This account no longer exists, so only its content can come back, not its sign-ins.'}
        </p>
        <p className={styles.lead}>{accountRestoreSentence(preview)}</p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">In backup</th>
              <th scope="col">Now</th>
              <th scope="col">Comes back</th>
              <th scope="col">Reverts</th>
              <th scope="col">Newer, kept</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.table}>
                <th scope="row">{tableLabel(t.table)}</th>
                <td>{t.in_backup}</td>
                <td>{t.live}</td>
                <td className={t.missing > 0 ? styles.hot : undefined}>{t.missing}</td>
                <td className={t.changed > 0 ? styles.hot : undefined}>{t.changed}</td>
                <td>{t.newer}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {worth.length > 0 ? (
          <details className={styles.details} open>
            <summary>What would come back ({worth.length})</summary>
            <ul className={styles.items}>
              {worth.map((i, n) => (
                <li key={n}>
                  <strong>{i.name}</strong>
                  <span className={styles.muted}>
                    {' '}
                    {tableLabel(i.table)}
                    {i.person && i.table !== 'profiles' ? `, ${i.person}` : ''}: {STATUS_WORD[i.status]}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <details className={styles.details}>
          <summary>Everything named in this backup ({preview.items.length})</summary>
          <ul className={styles.items}>
            {preview.items.map((i, n) => (
              <li key={n}>
                {i.name}
                <span className={styles.muted}>
                  {' '}
                  {tableLabel(i.table)}: {STATUS_WORD[i.status]}
                </span>
              </li>
            ))}
          </ul>
        </details>

        {result ? (
          <p className={styles.done} role="status">
            Done. {result.total} {result.total === 1 ? 'row' : 'rows'} restored
            {result.restored.length > 0 ? ` (${result.restored.map((r) => `${r.rows} ${tableLabel(r.table).toLowerCase()}`).join(', ')})` : ''}. A copy of the database from just before is kept on the server as {result.safety_copy}. Their devices pick the change up the next time they sync.
          </p>
        ) : null}

        {preview.will_restore > 0 ? (
          <>
            <TextField label={`Type the account name to confirm: ${preview.account.name}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button variant="danger" loading={busy} disabled={confirm.trim() !== preview.account.name.trim()} onClick={() => void restore()}>
              Restore {preview.will_restore} {preview.will_restore === 1 ? 'row' : 'rows'}
            </Button>
          </>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <TextField label="Find an account as it was that day" hint="Account name, an admin's email, or a person's name." value={query} onChange={(e) => setQuery(e.target.value)} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {accounts?.length === 0 ? <p className={styles.muted}>No account matches in this backup.</p> : null}
      {accounts?.map((a) => (
        <button key={a.id} type="button" className={styles.row} disabled={busy} onClick={() => void open(a)}>
          <strong>{a.name}</strong>
          <span className={styles.muted}>
            {a.kind} · {a.people.join(', ') || 'no people'} · {a.admins.join(', ') || 'no admin'}
            {a.exists_now ? '' : ' · gone now'}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Every account back to one day. The counts first, then the words RESTORE and the date. */
function FullRestore({ date }: { date: string }) {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [status, setStatus] = useState<RestoreStatus | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const phrase = `RESTORE ${date}`;

  const readStatus = useCallback(() => {
    // The server stops for a moment in the middle of a restore, so a failed read just means "ask again".
    void api.get<RestoreStatus>('/admin/backups/restore-status', { schema: RestoreStatusSchema }).then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    readStatus();
  }, [readStatus]);

  useEffect(() => {
    if (status?.state !== 'running') return;
    const timer = setInterval(readStatus, 3000);
    return () => clearInterval(timer);
  }, [status?.state, readStatus]);

  async function count(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      setSummary(await api.get<BackupSummary>(`/admin/backups/${date}/summary`, { schema: BackupSummarySchema, timeoutMs: 120_000 }));
    } catch (err) {
      setError(failure(err, "Couldn't read that backup."));
    } finally {
      setBusy(false);
    }
  }

  async function start(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/admin/backups/${date}/restore-all`, { confirm });
      setStatus({ state: 'running', date, started_at: Date.now(), finished_at: null, message: null });
    } catch (err) {
      setError(failure(err, "The restore didn't start. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  const differences = summary ? summaryDifferences(summary) : [];

  return (
    <div className={styles.stack}>
      <p className={styles.warn}>
        This puts every account back to how it was on {date}. Everything anyone has done since then is lost, for all users, and the app is offline for about a minute. To fix one family, use &ldquo;One account&rdquo; instead.
      </p>
      {status && status.state !== 'idle' ? (
        <p className={status.state === 'failed' ? styles.error : styles.done} role="status">
          {status.state === 'running' ? `Restoring ${status.date ?? ''}... this page keeps checking.` : status.state === 'done' ? `The last whole-database restore (${status.date ?? ''}) finished.` : `The last whole-database restore failed, and the database was left as it was. ${status.message ?? ''}`}
        </p>
      ) : null}
      {summary ? (
        <>
          <p className={styles.lead}>
            The backup holds {summary.totals.in_backup} rows. The live database holds {summary.totals.live}.{' '}
            {differences.length === 0 ? 'Every table has the same number of rows.' : 'These tables differ:'}
          </p>
          {differences.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">What</th>
                  <th scope="col">In backup</th>
                  <th scope="col">Now</th>
                  <th scope="col">Lost by restoring</th>
                </tr>
              </thead>
              <tbody>
                {differences.map((t) => (
                  <tr key={t.table}>
                    <th scope="row">{tableLabel(t.table)}</th>
                    <td>{t.in_backup}</td>
                    <td>{t.live}</td>
                    <td className={t.lost > 0 ? styles.hot : undefined}>{t.lost > 0 ? t.lost : `${-t.lost} come back`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <TextField label={`Type ${phrase} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" />
          <Button variant="danger" loading={busy} disabled={confirm.trim() !== phrase || status?.state === 'running'} onClick={() => void start()}>
            Restore the whole database
          </Button>
        </>
      ) : (
        <Button variant="secondary" loading={busy} onClick={() => void count()}>
          Count what would change
        </Button>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Super admins only: the nightly backups, and restoring from one. */
export function BackupsPanel() {
  const { user } = useSession();
  const [list, setList] = useState<BackupList | null>(null);
  const [picked, setPicked] = useState<BackupFile | null>(null);
  const [mode, setMode] = useState<'account' | 'all'>('account');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user?.is_super_admin) return;
    void api
      .get<BackupList>('/admin/backups', { schema: BackupListSchema })
      .then(setList)
      .catch(() => setFailed(true));
  }, [user?.is_super_admin]);

  if (!user?.is_super_admin) return <p className={styles.muted}>This page is for Chipperly&rsquo;s own team.</p>;
  if (failed) return <p className={styles.error}>Couldn&rsquo;t load the backups.</p>;
  if (!list) return null;
  if (!list.enabled) return <p className={styles.muted}>This server keeps no backups, so there is nothing to restore from here.</p>;

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="Backups">
        <h2 className={styles.heading}>Nightly backups</h2>
        <p className={styles.muted}>
          One is taken every night and before every update. {list.backups.length} are kept on the server, and a copy of each goes to Cloudflare for 30 days.
        </p>
        {list.backups.length === 0 ? <p className={styles.muted}>No backups yet.</p> : null}
        {list.backups.map((b) => (
          <button key={b.date} type="button" className={styles.row} aria-pressed={picked?.date === b.date} onClick={() => setPicked(b)}>
            <strong>{b.date}</strong>
            <span className={styles.muted}>
              taken {when(b.taken_at)} · {sizeLabel(b.size_bytes)}
            </span>
          </button>
        ))}
      </section>

      {picked ? (
        <section className={styles.card} aria-label={`Restore from ${picked.date}`}>
          <h2 className={styles.heading}>Restore from {picked.date}</h2>
          <Segmented
            label="What to restore"
            items={[
              { value: 'account', label: 'One account' },
              { value: 'all', label: 'Whole database' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'account' | 'all')}
          />
          {mode === 'account' ? <AccountRestore key={picked.date} date={picked.date} /> : <FullRestore key={picked.date} date={picked.date} />}
        </section>
      ) : null}
    </div>
  );
}

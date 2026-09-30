'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { api, ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import {
  REPORT_REASONS,
  canModerate,
  type ModerationAction,
  type ModerationReport,
  type ReportStatus,
} from '@/lib/data/moderation';
import { toast } from '@/lib/toast';
import styles from './ReportQueue.module.css';

const TABS: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
];

const ACTIONS: { action: ModerationAction; label: string; variant: 'secondary' | 'danger' | 'ghost' }[] = [
  { action: 'hide', label: 'Hide', variant: 'secondary' },
  { action: 'remove', label: 'Remove', variant: 'danger' },
  { action: 'dismiss', label: 'Dismiss', variant: 'ghost' },
];

const reasonLabel = (r: ModerationReport['reason']): string => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;
const when = (ms: number): string => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

interface CardProps {
  report: ModerationReport;
  onResolved: () => void;
}

function ReportCard({ report, onResolved }: CardProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = report.status === 'open';
  const t = report.target;

  async function resolve(action: ModerationAction): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const trimmed = note.trim();
      await api.post(`/community/moderation/reports/${report.id}/resolve`, { action, ...(trimmed ? { note: trimmed } : {}) });
      toast(action === 'dismiss' ? 'Report dismissed' : action === 'hide' ? 'Hidden' : 'Removed');
      onResolved();
    } catch (e) {
      // Someone else got there first: reload so this card shows who did what.
      if (e instanceof ApiError && e.status === 409) onResolved();
      else setError(e instanceof ApiError ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={styles.card}>
      <p className={styles.reason}>
        {reasonLabel(report.reason)}
        {report.reason === 'child_safety' ? <span className={styles.urgent}> Urgent</span> : null}
      </p>
      <p className={styles.meta}>
        Reported {report.target_type} on {when(report.created_at)}
      </p>
      <blockquote className={styles.content}>
        {t ? (
          <>
            <span className={styles.author}>{t.author_nickname ?? 'unknown'}</span>
            {t.status !== 'published' ? <span className={styles.state}> ({t.status})</span> : null}
            {t.title ? <strong className={styles.title}>{t.title}</strong> : null}
            {t.body ? <span className={styles.body}>{t.body}</span> : null}
          </>
        ) : (
          <span className={styles.body}>This content is no longer available.</span>
        )}
      </blockquote>
      {report.note ? <p className={styles.meta}>Reporter said: {report.note}</p> : null}

      {open ? (
        <div className={styles.actions}>
          <label className={styles.noteLabel}>
            <span>Note (optional)</span>
            <input
              className={styles.noteInput}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className={styles.buttons}>
            {ACTIONS.map((a) => (
              <Button
                key={a.action}
                variant={a.variant}
                loading={busy === a.action}
                disabled={busy !== null}
                onClick={() => void resolve(a.action)}
              >
                {a.label}
              </Button>
            ))}
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className={styles.done}>
          {report.status === 'dismissed' ? 'Dismissed' : report.action === 'remove' ? 'Removed' : 'Hidden'} by{' '}
          {report.resolved_by_nickname ?? 'a moderator'}
          {report.resolved_at ? ` on ${when(report.resolved_at)}` : ''}
          {report.resolution_note ? `. Note: ${report.resolution_note}` : ''}
        </p>
      )}
    </li>
  );
}

/** Moderators only (canModerate). Renders nothing for anyone else; the server also returns 403. */
export function ReportQueue() {
  const { user } = useSession();
  const allowed = canModerate(user);
  const [status, setStatus] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<ModerationReport[] | null>(null);
  const [error, setError] = useState(false);

  /** `isLive` keeps a late reply from writing state after the screen has gone. */
  const refresh = useCallback(
    (s: ReportStatus, isLive: () => boolean): Promise<void> =>
      api.get<{ reports: ModerationReport[] }>(`/community/moderation/reports?status=${s}`).then(
        (r) => {
          if (!isLive()) return;
          setReports(r.reports);
          setError(false);
        },
        () => {
          if (isLive()) setError(true);
        },
      ),
    [],
  );

  const load = useCallback((s: ReportStatus): Promise<void> => refresh(s, () => true), [refresh]);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void refresh(status, () => live);
    return () => {
      live = false;
    };
  }, [allowed, status, refresh]);

  if (!allowed) return null;

  return (
    <section className={styles.queue} aria-label="Reports">
      <Segmented
        label="Report status"
        items={TABS}
        value={status}
        onChange={(v) => {
          setReports(null);
          setStatus(v as ReportStatus);
        }}
      />
      {error ? (
        <p className={styles.error} role="alert">
          Couldn&rsquo;t load reports.
        </p>
      ) : reports === null ? (
        <p className={styles.meta}>Loading&hellip;</p>
      ) : reports.length === 0 ? (
        <p className={styles.meta}>{status === 'open' ? 'Nothing waiting. All reports are dealt with.' : 'Nothing here yet.'}</p>
      ) : (
        <ul className={styles.list}>
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} onResolved={() => void load(status)} />
          ))}
        </ul>
      )}
    </section>
  );
}

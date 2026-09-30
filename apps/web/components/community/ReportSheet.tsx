'use client';

import { useCallback, useState } from 'react';
import type { ReportReason } from '@chipperly/shared/schemas/community';
import { Button } from '@/components/ui/Button';
import { useSheet } from '@/components/ui/Sheet';
import { api, ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { REPORT_REASONS } from '@/lib/data/moderation';
import { toast } from '@/lib/toast';
import styles from './ReportSheet.module.css';

export type ReportTarget =
  | { target_type: 'post' | 'comment'; target_id: string }
  | { target_type: 'profile'; target_nickname: string };

const NOTE_MAX = 500;

/** Sheet content: pick a reason, optionally add a note, send. Confirms only after the server accepts it. */
export function ReportSheet(target: ReportTarget) {
  const { close } = useSheet();
  const { status } = useSession();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      const trimmed = note.trim();
      await api.post('/community/reports', { ...target, reason, ...(trimmed ? { note: trimmed } : {}) });
      setSent(true);
      toast('Report sent. Thank you.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The report didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (status !== 'signed_in') {
    return (
      <div className={styles.sheet}>
        <p className={styles.text}>Sign in to report something.</p>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className={styles.sheet} role="status">
        <p className={styles.text}>Report sent. A person on our team will look at it.</p>
        <Button onClick={close}>Done</Button>
      </div>
    );
  }

  return (
    <div className={styles.sheet}>
      <fieldset className={styles.reasons}>
        <legend className={styles.legend}>Why are you reporting this {target.target_type}?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r.value} className={styles.reason}>
            <input
              type="radio"
              name="report-reason"
              className={styles.radio}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>
      {reason === 'child_safety' ? (
        <p className={styles.hint}>If a child is in danger right now, contact your local emergency number first.</p>
      ) : null}
      <label className={styles.noteLabel}>
        <span>Anything we should know? (optional)</span>
        <textarea
          className={styles.note}
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button fullWidth disabled={!reason} loading={sending} onClick={() => void send()}>
        Send report
      </Button>
    </div>
  );
}

/**
 * For the Report button on a post or comment:
 * `const openReportSheet = useOpenReportSheet(); ... onClick={() => openReportSheet({ target_type: 'post', target_id: id })}`
 */
export function useOpenReportSheet(): (target: ReportTarget) => void {
  const { open } = useSheet();
  return useCallback(
    (target: ReportTarget) => open(<ReportSheet {...target} />, { title: 'Report' }),
    [open],
  );
}

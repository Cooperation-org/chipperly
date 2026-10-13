'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { profileReportToCsv, type ProfileReport } from '@chipperly/shared/schemas/report';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { api, ApiError } from '@/lib/api/client';
import { useActiveProfile } from '@/lib/profile/active';
import { downloadText, REPORT_ERROR, tzOffset } from '@/lib/reports/download';
import { shortDate } from '@/lib/reports/charts';
import { FeelingsChart, LineChart, TasksChart } from './Charts';
import styles from './Reports.module.css';

/** One person's report: tasks, chips, feelings and notes for the last 7 or 30 days. Read only, so viewers get it too. */
export function PersonReport() {
  const params = useSearchParams();
  const { profile } = useActiveProfile();
  const profileId = params.get('id') ?? profile?.id;
  const [days, setDays] = useState('7');
  const [report, setReport] = useState<ProfileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.get<ProfileReport>(`/profiles/${profileId}/report?days=${days}&tz_offset=${tzOffset()}`);
        if (cancelled) return;
        setReport(r);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError && e.status === 403 ? 'You cannot open this report.' : REPORT_ERROR);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, days, reloads]);

  if (error) return <EmptyState sentence={error} actions={[<Button key="r" onClick={() => setReloads((n) => n + 1)}>Try again</Button>]} />;
  if (!profileId) return <p className={styles.muted}>Pick a person first.</p>;

  const shown = report && report.profile_id === profileId && report.days.length === Number(days) ? report : null;
  const dates = shown?.days.map((d) => d.date) ?? [];

  return (
    <div className={styles.page}>
      <h1 className={styles.name}>{shown?.name ?? report?.name ?? profile?.name ?? ''}</h1>
      <Segmented
        label="Time range"
        value={days}
        onChange={setDays}
        items={[
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
        ]}
      />
      {!shown ? (
        <p className={styles.muted}>Loading</p>
      ) : (
        <>
          <TasksChart dates={dates} done={shown.days.map((d) => d.tasks_done)} planned={shown.days.map((d) => d.tasks_planned)} />
          <LineChart title="Chips earned each day" noun="Chips" dates={dates} values={shown.days.map((d) => d.chips_earned)} />
          <p className={styles.muted}>Chips spent in this time: {shown.days.reduce((n, d) => n + d.chips_spent, 0)}</p>
          <FeelingsChart dates={dates} counts={shown.days.map((d) => d.feelings)} />

          <section aria-labelledby="notes-h">
            <h2 id="notes-h" className={styles.h2}>Notes</h2>
            {shown.notes.length === 0 ? (
              <p className={styles.muted}>No notes in this time.</p>
            ) : (
              <ol className={styles.notes}>
                {shown.notes.map((n, i) => (
                  <li key={`${n.date}${i}`} className={styles.note}>
                    <span className={styles.noteHead}>
                      {shortDate(n.date)} <span className={styles.muted}>{n.author}</span>
                    </span>
                    <span className={styles.noteText}>{n.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <Button variant="secondary" onClick={() => downloadText(`${shown.name}-report-${shown.to}.csv`, profileReportToCsv(shown))}>
            Download CSV
          </Button>
        </>
      )}
    </div>
  );
}

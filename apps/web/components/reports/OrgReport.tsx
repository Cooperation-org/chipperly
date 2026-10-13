'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { accountReportToCsv, type AccountReport } from '@chipperly/shared/schemas/report';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { selectProfile, useActiveAccount } from '@/lib/profile/active';
import { activeClusters, pickOrgAccount, type Cluster } from '@/lib/org/roster';
import { lastActiveLabel, sortPeople, type PeopleSortKey } from '@/lib/reports/charts';
import { downloadText, REPORT_ERROR, tzOffset } from '@/lib/reports/download';
import { LineChart } from './Charts';
import styles from './Reports.module.css';

/** Roles that can open the account report. Moderators see their own groups only; the server enforces it. */
export function canSeeAccountReport(role: string | undefined): boolean {
  return role === 'admin' || role === 'moderator';
}

const SORTS: { value: PeopleSortKey; label: string }[] = [
  { value: 'last_active', label: 'Last active' },
  { value: 'name', label: 'Name' },
  { value: 'tasks_done', label: 'Tasks' },
  { value: 'chips_earned', label: 'Chips' },
];

/** The organization report, or the family report for a household: people active per day, a sortable people table and staff activity. */
export function OrgReport() {
  const router = useRouter();
  const { accounts } = useSession();
  const { account: active } = useActiveAccount();
  const org = pickOrgAccount(accounts, active?.id);
  const mine = org ?? accounts.find((a) => a.account.id === active?.id && canSeeAccountReport(a.role));
  const accountId = mine?.account.id;
  const isOrg = Boolean(org);

  const [days, setDays] = useState('7');
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [sort, setSort] = useState<PeopleSortKey>('last_active');
  const [report, setReport] = useState<AccountReport | null>(null);
  const [groups, setGroups] = useState<Cluster[]>([]);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!accountId || !canSeeAccountReport(mine?.role)) return;
    let cancelled = false;
    void (async () => {
      try {
        const group = clusterId ? `&cluster_id=${clusterId}` : '';
        const [r, c] = await Promise.all([
          api.get<AccountReport>(`/accounts/${accountId}/report?days=${days}&tz_offset=${tzOffset()}${group}`),
          isOrg ? api.get<{ clusters: Cluster[] }>(`/accounts/${accountId}/clusters`) : Promise.resolve({ clusters: [] as Cluster[] }),
        ]);
        if (cancelled) return;
        setReport(r);
        setNow(Date.now());
        setGroups(activeClusters(c.clusters));
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, mine?.role, days, clusterId, isOrg, reloads]);

  const rows = useMemo(() => sortPeople(report?.people ?? [], sort), [report, sort]);

  if (!mine || !canSeeAccountReport(mine.role)) return <p className={styles.muted}>Only admins can open this report.</p>;
  if (error) return <EmptyState sentence={REPORT_ERROR} actions={[<Button key="r" onClick={() => setReloads((n) => n + 1)}>Try again</Button>]} />;

  const noun = isOrg ? 'people' : 'family members';
  const shown = report && report.active_per_day.length === Number(days) ? report : null;


  return (
    <div className={styles.page}>
      <Segmented
        label="Time range"
        value={days}
        onChange={setDays}
        items={[
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
        ]}
      />
      {groups.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="Filter by group">
          <button type="button" className={[styles.chip, clusterId === null ? styles.chipOn : ''].join(' ')} aria-pressed={clusterId === null} onClick={() => setClusterId(null)}>
            All
          </button>
          {groups.map((c) => (
            <button key={c.id} type="button" className={[styles.chip, clusterId === c.id ? styles.chipOn : ''].join(' ')} aria-pressed={clusterId === c.id} onClick={() => setClusterId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {!shown ? (
        <p className={styles.muted}>Loading</p>
      ) : (
        <>
          <LineChart
            title={`Active ${noun} each day`}
            noun={`Active ${noun}`}
            dates={shown.active_per_day.map((d) => d.date)}
            values={shown.active_per_day.map((d) => d.active_people)}
          />
          <p className={styles.muted}>
            {shown.active_per_day.at(-1)!.active_people} of {shown.people_total} {noun} were active today.
          </p>

          <section aria-labelledby="people-h">
            <h2 id="people-h" className={styles.h2}>{isOrg ? 'People' : 'Family'}</h2>
            <Segmented label="Sort by" value={sort} onChange={(v) => setSort(v as PeopleSortKey)} items={SORTS} />
            {rows.length === 0 ? (
              <p className={styles.muted}>No one here yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      {isOrg ? <th scope="col">Group</th> : null}
                      <th scope="col">Tasks</th>
                      <th scope="col">Chips</th>
                      <th scope="col">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.profile_id}>
                        <th scope="row">
                          <button
                            type="button"
                            className={styles.link}
                            onClick={() => {
                              void selectProfile(p.profile_id).then(() => router.push(`/reports/?id=${p.profile_id}`));
                            }}
                          >
                            {p.name}
                          </button>
                        </th>
                        {isOrg ? <td>{p.group ?? 'No group'}</td> : null}
                        <td>{p.tasks_done}</td>
                        <td>{p.chips_earned}</td>
                        <td>{lastActiveLabel(p.last_active, now, tzOffset())}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="staff-h">
            <h2 id="staff-h" className={styles.h2}>Team activity</h2>
            <p className={styles.muted}>Tasks marked done by each team member in this time. Other edits are not counted.</p>
            <ul className={styles.staff}>
              {shown.staff.map((s) => (
                <li key={s.user_id}>
                  <span>{s.display_name}</span>
                  <span>{s.completions}</span>
                </li>
              ))}
            </ul>
          </section>

          <Button variant="secondary" onClick={() => downloadText(`people-report-${shown.to}.csv`, accountReportToCsv(shown))}>
            Download CSV
          </Button>
        </>
      )}
    </div>
  );
}

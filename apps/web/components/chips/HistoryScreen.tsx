'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ChipLedger } from '@chipperly/shared/schemas/chips';
import { todayIso, formatDayLabel } from '@chipperly/shared/helpers/date';
import { db } from '@/lib/db/db';
import { useActiveProfile } from '@/lib/profile/active';
import { useLedger } from '@/lib/data/chips';
import { useLocations } from '@/lib/data/locations';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { ListRow } from '@/components/ui/ListRow';
import styles from './HistoryScreen.module.css';

const ALL = 'all';

function itemNameFor(row: ChipLedger, activityNames: Map<string, string>, rewardNames: Map<string, string>): string {
  if (!row.ref_id) return '';
  if (row.reason === 'task' || row.reason === 'step') return activityNames.get(row.ref_id) ?? '';
  if (row.reason === 'redeem' || row.reason === 'adjust') return rewardNames.get(row.ref_id) ?? '';
  return '';
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** S12: read-only ledger, newest first, grouped by day. */
export function HistoryScreen() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const locations = useLocations(profileId);
  const [locationFilter, setLocationFilter] = useState<string>(ALL);

  const ledger = useLedger(profileId, locationFilter === ALL ? undefined : locationFilter);

  const activities = useLiveQuery(() => db.activities.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const rewards = useLiveQuery(() => db.rewards.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const users = useLiveQuery(() => db.users.toArray(), [], []);

  const activityNames = useMemo(() => new Map(activities.map((a) => [a.id, a.name])), [activities]);
  const rewardNames = useMemo(() => new Map(rewards.map((r) => [r.id, r.name])), [rewards]);
  const userNames = useMemo(() => new Map(users.map((u) => [u.id, u.display_name])), [users]);

  const groups = useMemo(() => {
    const byDay = new Map<string, ChipLedger[]>();
    for (const row of ledger) {
      const dayIso = todayIso(new Date(row.created_at));
      const rows = byDay.get(dayIso) ?? [];
      rows.push(row);
      byDay.set(dayIso, rows);
    }
    return Array.from(byDay.entries());
  }, [ledger]);

  if (!profile) return null;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <IconButton icon="arrowLeft" aria-label="Back" onClick={() => router.back()} />
        <h1 className={styles.title}>Chip history</h1>
      </div>

      <Segmented
        label="Location"
        items={[{ value: ALL, label: 'All' }, ...locations.map((loc) => ({ value: loc.id, label: loc.name }))]}
        value={locationFilter}
        onChange={setLocationFilter}
      />

      <div className={styles.list}>
        {groups.map(([dayIso, rows]) => (
          <section key={dayIso} className={styles.day}>
            <h2 className={styles.dayLabel}>{formatDayLabel(dayIso)}</h2>
            {rows.map((row) => {
              const name = itemNameFor(row, activityNames, rewardNames);
              const person = userNames.get(row.created_by);
              return (
                <ListRow
                  key={row.id}
                  tile={
                    <span className={[styles.badge, row.delta < 0 ? styles.negative : styles.positive].join(' ')}>
                      {row.delta > 0 ? `+${row.delta}` : row.delta}
                    </span>
                  }
                  name={name}
                  secondary={person}
                  trailing={<span className={styles.time}>{formatTime(row.created_at)}</span>}
                />
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

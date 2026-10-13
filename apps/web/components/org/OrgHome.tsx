'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Picture } from '@/components/media/Picture';
import { ProfileSearchField } from '@/components/shell/ProfileSearchField';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { useSheet } from '@/components/ui/Sheet';
import { api, ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { syncNow } from '@/lib/sync/engine';
import { selectProfile, useActiveAccount } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import {
  OVER_PLAN_MESSAGE,
  PAGE_SIZE,
  activeClusters,
  canManageOrg,
  canMovePeople,
  filterRoster,
  initials,
  isOverSeats,
  orgErrorMessage,
  pickOrgAccount,
  seatLabel,
  staffNames,
  type Cluster,
  type RosterPerson,
  type RosterResponse,
  type StatusFilter,
} from '@/lib/org/roster';
import { AddPeople } from './AddPeople';
import styles from './Org.module.css';

function PersonSheet({
  person,
  clusters,
  canUnassign,
  onMove,
  onArchive,
}: {
  person: RosterPerson;
  clusters: Cluster[];
  /** Taking someone out of every group is for admins; a moderator moves people between their own groups. */
  canUnassign: boolean;
  onMove: (clusterId: string | null) => void;
  onArchive: () => void;
}) {
  return (
    <div className={styles.sheetList}>
      <p className={styles.hint}>Move to group</p>
      {person.cluster_id && canUnassign ? (
        <button type="button" className={styles.sheetRow} onClick={() => onMove(null)}>
          No group
        </button>
      ) : null}
      {clusters
        .filter((c) => c.id !== person.cluster_id)
        .map((c) => (
          <button key={c.id} type="button" className={styles.sheetRow} onClick={() => onMove(c.id)}>
            {c.name}
          </button>
        ))}
      {clusters.length === 0 ? <p className={styles.hint}>No groups yet. Add one under Groups.</p> : null}
      <Button variant={person.archived_at === null ? 'danger' : 'primary'} onClick={onArchive}>
        {person.archived_at === null ? 'Archive' : 'Restore'}
      </Button>
    </div>
  );
}

/** The home of an organization account: seat count, search, group and status filters, and the people list. */
export function OrgHome() {
  const router = useRouter();
  const { open, close } = useSheet();
  const { accounts } = useSession();
  const { account: activeAccount } = useActiveAccount();
  const org = pickOrgAccount(accounts, activeAccount?.id);
  const accountId = org?.account.id;
  const admin = canManageOrg(org?.role);
  const mover = canMovePeople(org?.role);

  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [shown, setShown] = useState(PAGE_SIZE);

  const [reloads, setReloads] = useState(0);
  const load = (): void => setReloads((n) => n + 1);

  // setState runs only after the awaits, and a superseded fetch is dropped.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [r, c] = await Promise.all([
          api.get<RosterResponse>(`/accounts/${accountId}/roster?status=all`),
          api.get<{ clusters: Cluster[] }>(`/accounts/${accountId}/clusters`),
        ]);
        if (cancelled) return;
        setRoster(r);
        setClusters(c.clusters);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, reloads]);

  const groups = useMemo(() => activeClusters(clusters), [clusters]);
  const groupName = useMemo(() => new Map(clusters.map((c) => [c.id, c.name])), [clusters]);
  const list = useMemo(() => filterRoster(roster?.people ?? [], { q: query, clusterId, status }), [roster, query, clusterId, status]);

  if (!org || !accountId) return null;

  function pickGroup(id: string | null): void {
    setClusterId(id);
    setShown(PAGE_SIZE);
  }

  async function patchPerson(p: RosterPerson, body: { cluster_id?: string | null; archived?: boolean }): Promise<void> {
    close();
    try {
      await api.patch(`/accounts/${accountId}/profiles/${p.profile_id}`, body);
      toast(body.archived === true ? `Archived ${p.name}` : body.archived === false ? `Restored ${p.name}` : `Moved ${p.name}`);
      load();
      // The switcher reads this device's copy of the profiles: pull the change now instead of at the next poll.
      void syncNow();
    } catch (e) {
      toast(e instanceof ApiError ? orgErrorMessage(e.code) : 'Could not reach the server. Try again.');
    }
  }

  async function openPerson(p: RosterPerson): Promise<void> {
    await selectProfile(p.profile_id);
    router.push('/today/');
  }

  const seats = roster?.seats;
  const over = seats ? isOverSeats(seats) || seats.over === true : false;
  const visible = list.slice(0, shown);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.orgName}>{org.account.name}</h1>
        {admin ? (
          <IconButton
            icon="plus"
            variant="solid"
            aria-label="Add people"
            onClick={() =>
              open(
                <AddPeople
                  accountId={accountId}
                  clusters={groups}
                  onDone={(res) => {
                    close();
                    toast(
                      res.errors.length > 0
                        ? `Added ${res.created.length}. ${res.errors.length} could not be added.`
                        : `Added ${res.created.length} ${res.created.length === 1 ? 'person' : 'people'}`,
                    );
                    load();
                  }}
                />,
                { title: 'Add people' },
              )
            }
          />
        ) : null}
      </div>

      {seats ? (
        over ? (
          <p className={styles.seatsOver} role="status">
            <strong>{seatLabel(seats)}</strong>
            {OVER_PLAN_MESSAGE}
          </p>
        ) : (
          <p className={styles.seats}>{seatLabel(seats)}</p>
        )
      ) : null}

      <ProfileSearchField value={query} onChange={(v) => { setQuery(v); setShown(PAGE_SIZE); }} />

      <div className={styles.chips} role="group" aria-label="Filter by group">
        <button type="button" className={[styles.chip, clusterId === null ? styles.chipOn : ''].join(' ')} aria-pressed={clusterId === null} onClick={() => pickGroup(null)}>
          All
        </button>
        {groups.map((c) => (
          <button key={c.id} type="button" className={[styles.chip, clusterId === c.id ? styles.chipOn : ''].join(' ')} aria-pressed={clusterId === c.id} onClick={() => pickGroup(c.id)}>
            {c.name}
          </button>
        ))}
        {groups.length > 0 ? (
          <button type="button" className={[styles.chip, clusterId === 'none' ? styles.chipOn : ''].join(' ')} aria-pressed={clusterId === 'none'} onClick={() => pickGroup('none')}>
            No group
          </button>
        ) : null}
      </div>

      <Segmented
        label="Status"
        value={status}
        onChange={(v) => { setStatus(v as StatusFilter); setShown(PAGE_SIZE); }}
        items={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
      />

      {failed ? (
        <EmptyState sentence="Could not load your people." actions={[<Button key="r" onClick={load}>Try again</Button>]} />
      ) : !roster ? (
        <p className={styles.empty}>Loading</p>
      ) : list.length === 0 ? (
        <p className={styles.empty}>{query || clusterId || status === 'archived' ? 'No one matches.' : admin ? 'No people yet. Tap + to add some.' : 'No one is assigned to you yet.'}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {visible.map((p) => (
              <li key={p.profile_id} className={styles.person}>
                <button type="button" className={styles.personMain} onClick={() => openPerson(p)}>
                  <Picture emoji={p.emoji} photo_id={p.photo_id} name={p.name} size="list" />
                  <span className={styles.personText}>
                    <span className={styles.personName}>{p.name}</span>
                    <span className={styles.personGroup}>{p.cluster_id ? (groupName.get(p.cluster_id) ?? '') : 'No group'}</span>
                    {staffNames(p.team) ? <span className={styles.personGroup}>Staff: {staffNames(p.team)}</span> : null}
                  </span>
                  <span className={styles.team} aria-label={p.team.length > 0 ? `Team: ${p.team.map((t) => t.display_name).join(', ')}` : undefined}>
                    {p.team.slice(0, 3).map((t) => (
                      <span key={t.user_id} className={styles.avatar} aria-hidden>
                        {initials(t.display_name)}
                      </span>
                    ))}
                    {p.team.length > 3 ? <span className={styles.avatar} aria-hidden>+{p.team.length - 3}</span> : null}
                  </span>
                </button>
                {mover ? (
                  <IconButton
                    icon="more"
                    aria-label={`Actions for ${p.name}`}
                    onClick={() =>
                      open(
                        <PersonSheet
                          person={p}
                          clusters={groups}
                          canUnassign={admin}
                          onMove={(id) => void patchPerson(p, { cluster_id: id })}
                          onArchive={() => void patchPerson(p, { archived: p.archived_at === null })}
                        />,
                        { title: p.name },
                      )
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {list.length > shown ? (
            <BigButton variant="secondary" fullWidth onClick={() => setShown((n) => n + PAGE_SIZE)}>
              Show more ({list.length - shown} left)
            </BigButton>
          ) : null}
        </>
      )}

      {mover ? (
        <Button variant="secondary" onClick={() => router.push('/org/clusters/')}>
          Groups
        </Button>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import type { AccountMembersResponse, Role } from '@chipperly/shared/schemas/account';
import { api, ApiError } from '@/lib/api/client';
import { roleLabel } from '@/lib/auth/roleRules';
import { useSession } from '@/lib/auth/session';
import { useActiveAccount } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { activeClusters, canManageOrg, canMovePeople, orgErrorMessage, pickOrgAccount, type Cluster } from '@/lib/org/roster';
import styles from './Org.module.css';

function NameSheet({ initial, label, onSave }: { initial: string; label: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className={styles.addForm}>
      <TextField label="Group name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
      <Button
        loading={saving}
        disabled={!name.trim()}
        onClick={() => {
          setSaving(true);
          void onSave(name.trim()).finally(() => setSaving(false));
        }}
      >
        {label}
      </Button>
    </div>
  );
}

interface StaffRow {
  user_id: string;
  name: string;
  role: Role;
  clusterIds: string[];
}

/** Tick the staff who cover one group. Saves one change per person whose groups changed. */
function StaffSheet({ accountId, group, onDone }: { accountId: string; group: Cluster; onDone: () => void }) {
  const { close } = useSheet();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<AccountMembersResponse>(`/accounts/${accountId}/members`);
        if (cancelled) return;
        // Admins see every group, and families are added from their own invite, so only Moderators and Staff are listed.
        const list = res.members
          .filter((m) => m.role === 'moderator' || m.role === 'member')
          .map((m) => ({ user_id: m.user.id, name: m.user.display_name, role: m.role, clusterIds: m.cluster_ids ?? [] }));
        const current = new Set(list.filter((r) => r.clusterIds.includes(group.id)).map((r) => r.user_id));
        setRows(list);
        setOn(new Set(current));
        setInitial(current);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, group.id]);

  function toggle(id: string): void {
    setOn((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(): Promise<void> {
    if (!rows) return;
    setSaving(true);
    try {
      for (const r of rows) {
        if (on.has(r.user_id) === initial.has(r.user_id)) continue;
        const next = on.has(r.user_id) ? [...r.clusterIds, group.id] : r.clusterIds.filter((id) => id !== group.id);
        await api.put(`/accounts/${accountId}/members/${r.user_id}/groups`, { cluster_ids: next });
      }
      close();
      toast('Staff updated');
      onDone();
    } catch {
      setSaving(false);
      toast('Could not save. Try again.');
    }
  }

  if (error) return <p className={styles.empty}>Could not load the team.</p>;
  if (!rows) return <p className={styles.empty}>Loading</p>;
  if (rows.length === 0) return <p className={styles.empty}>No Staff or Moderators yet. Invite them from Team.</p>;
  return (
    <div className={styles.sheetList}>
      {rows.map((r) => (
        <ListRow
          key={r.user_id}
          tile={<Icon name="users" size={20} />}
          name={r.name}
          secondary={roleLabel(r.role, 'agency')}
          trailing={<CheckCircle checked={on.has(r.user_id)} onChange={() => toggle(r.user_id)} name={r.name} />}
          onTap={() => toggle(r.user_id)}
        />
      ))}
      <Button loading={saving} onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}

/** Groups (clusters) of an organization: list with counts and staff. Admins add, rename, archive when empty and assign staff; moderators see their own groups. */
export function GroupsScreen() {
  const { open, close } = useSheet();
  const { accounts } = useSession();
  const { account: activeAccount } = useActiveAccount();
  const org = pickOrgAccount(accounts, activeAccount?.id);
  const accountId = org?.account.id;
  const [clusters, setClusters] = useState<Cluster[] | null>(null);

  const [reloads, setReloads] = useState(0);
  const load = (): void => setReloads((n) => n + 1);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void (async () => {
      let rows: Cluster[] = [];
      try {
        rows = (await api.get<{ clusters: Cluster[] }>(`/accounts/${accountId}/clusters`)).clusters;
      } catch {
        // Leave the list empty; the screen says there are no groups.
      }
      if (!cancelled) setClusters(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, reloads]);

  if (!org || !accountId) return null;
  const admin = canManageOrg(org.role);
  if (!canMovePeople(org.role)) return <p className={styles.empty}>Only an admin or moderator can see groups.</p>;

  /** Runs a write; a server refusal is shown as text and the sheet stays open. */
  async function run(call: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await call();
      close();
      toast(done);
      load();
    } catch (e) {
      toast(e instanceof ApiError ? orgErrorMessage(e.code) : 'Could not reach the server. Try again.');
    }
  }

  const add = (): void =>
    open(<NameSheet initial="" label="Add group" onSave={(name) => run(() => api.post(`/accounts/${accountId}/clusters`, { name }), 'Group added')} />, { title: 'Add group' });
  const rename = (c: Cluster): void =>
    open(<NameSheet initial={c.name} label="Save" onSave={(name) => run(() => api.patch(`/accounts/${accountId}/clusters/${c.id}`, { name }), 'Group renamed')} />, { title: 'Rename group' });
  const archive = (c: Cluster): void =>
    open(
      <Confirm
        title={`Archive ${c.name}`}
        body="Only a group with no people can be archived."
        confirmLabel="Archive"
        danger
        onConfirm={() => void run(() => api.patch(`/accounts/${accountId}/clusters/${c.id}`, { archived: true }), 'Group archived')}
        onCancel={close}
      />,
    );

  const assign = (c: Cluster): void => open(<StaffSheet accountId={accountId} group={c} onDone={load} />, { title: `Staff in ${c.name}` });

  const list = activeClusters(clusters ?? []);
  return (
    <div className={styles.page}>
      {admin ? (
        <Button icon="plus" size="lg" fullWidth onClick={add}>
          Add group
        </Button>
      ) : null}
      {clusters === null ? (
        <p className={styles.empty}>Loading</p>
      ) : list.length === 0 ? (
        <p className={styles.empty}>{admin ? 'No groups yet. People can work without one.' : 'No groups are assigned to you yet.'}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((c) => (
            <li key={c.id} className={styles.groupRow}>
              <span className={styles.groupName}>
                {c.name}
                <br />
                <span className={styles.groupCount}>{c.profile_count} {c.profile_count === 1 ? 'person' : 'people'}</span>
                <br />
                <span className={styles.groupCount}>
                  {(c.staff ?? []).filter((x) => x.role !== 'viewer').length > 0
                    ? `Staff: ${(c.staff ?? []).filter((x) => x.role !== 'viewer').map((x) => x.display_name).join(', ')}`
                    : 'No staff yet'}
                </span>
              </span>
              {admin ? (
                <span className={styles.groupActions}>
                  <IconButton icon="users" aria-label={`Staff in ${c.name}`} onClick={() => assign(c)} />
                  <IconButton icon="edit" aria-label={`Rename ${c.name}`} onClick={() => rename(c)} />
                  <IconButton icon="trash" aria-label={`Archive ${c.name}`} onClick={() => archive(c)} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

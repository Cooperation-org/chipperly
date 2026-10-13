'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { api, ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { useActiveAccount } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { activeClusters, canManageOrg, orgErrorMessage, pickOrgAccount, type Cluster } from '@/lib/org/roster';
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

/** Groups (clusters) of an organization: list with counts, add, rename, archive when empty. Admins only. */
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
  if (!canManageOrg(org.role)) return <p className={styles.empty}>Only an admin can change groups.</p>;

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

  const list = activeClusters(clusters ?? []);
  return (
    <div className={styles.page}>
      <Button icon="plus" size="lg" fullWidth onClick={add}>
        Add group
      </Button>
      {clusters === null ? (
        <p className={styles.empty}>Loading</p>
      ) : list.length === 0 ? (
        <p className={styles.empty}>No groups yet. People can work without one.</p>
      ) : (
        <ul className={styles.list}>
          {list.map((c) => (
            <li key={c.id} className={styles.groupRow}>
              <span className={styles.groupName}>
                {c.name}
                <br />
                <span className={styles.groupCount}>{c.profile_count} {c.profile_count === 1 ? 'person' : 'people'}</span>
              </span>
              <span className={styles.groupActions}>
                <IconButton icon="edit" aria-label={`Rename ${c.name}`} onClick={() => rename(c)} />
                <IconButton icon="trash" aria-label={`Archive ${c.name}`} onClick={() => archive(c)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

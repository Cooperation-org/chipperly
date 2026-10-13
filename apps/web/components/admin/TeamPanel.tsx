'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRole, AdminTeamMember } from '@chipperly/shared/schemas/admin';
import { canChange, useAdminRole } from '@/lib/admin/role';
import { api, ApiError } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { NOT_TEAM, day } from './format';
import styles from './AdminDashboard.module.css';

const ROLE: Record<AdminRole, { name: string; does: string }> = {
  super: { name: 'Super admin', does: 'Everything, including money, roles and backups. Set in the server settings.' },
  support: { name: 'Support', does: 'Looks people up; extends trials, gives free access, resends emails, sends reminders and beta codes, handles feedback and moderation.' },
  moderator: { name: 'Moderator', does: 'The community moderation queue only.' },
};

/** Who can use the admin site. A role is given by email, so it can be set before the person signs up. */
export function TeamPanel() {
  const role = useAdminRole();
  const [team, setTeam] = useState<AdminTeamMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'support' | 'moderator'>('support');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    api.get<{ team: AdminTeamMember[] }>('/admin/team').then(
      (r) => {
        setTeam(r.team);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (failed) return <p className={styles.error} role="alert">Couldn&rsquo;t load the team.</p>;
  if (!team) return null;
  const editable = canChange(role);

  async function setRole(target: string, r: 'support' | 'moderator'): Promise<void> {
    await api.put('/admin/team', { email: target, role: r });
    toast(`${target} is now ${ROLE[r].name}`);
    load();
  }

  async function add(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await setRole(email.trim().toLowerCase(), newRole);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't add them. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: AdminTeamMember): Promise<void> {
    if (!window.confirm(`Remove ${member.email} from the admin team? They keep their Chipperly account but lose the admin site.`)) return;
    try {
      await api.delete(`/admin/team/${encodeURIComponent(member.email)}`);
      toast(`${member.email} removed`);
      load();
    } catch (err) {
      toast(err instanceof ApiError && err.message ? err.message : "Couldn't remove them.");
    }
  }

  return (
    <div className={styles.page} data-wide>
      <section className={styles.card} aria-label="What each role can do">
        <h2 className={styles.heading}>Roles</h2>
        {(Object.keys(ROLE) as AdminRole[]).map((r) => (
          <p key={r} className={styles.muted}>
            <strong>{ROLE[r].name}:</strong> {ROLE[r].does}
          </p>
        ))}
      </section>

      {editable ? (
        <section className={styles.card} aria-label="Add someone">
          <h2 className={styles.heading}>Add someone</h2>
          <p className={styles.muted}>Use the email they sign in with, for example chris@chipperlyapp.com. If they have no account yet, the role is waiting for them when they sign up.</p>
          <form className={styles.form} onSubmit={(e) => void add(e)}>
            <TextField label="Email" type="email" required value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
            <Segmented
              label="Role"
              value={newRole}
              onChange={(v) => setNewRole(v as 'support' | 'moderator')}
              items={[
                { value: 'support', label: 'Support' },
                { value: 'moderator', label: 'Moderator' },
              ]}
            />
            <Button type="submit" loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}>
              Add as {ROLE[newRole].name}
            </Button>
          </form>
        </section>
      ) : null}

      <section className={styles.card} aria-label="The team">
        <h2 className={styles.heading}>The team</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Account</th>
                <th scope="col">Added</th>
                {editable ? <th scope="col" aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.email}>
                  <td data-label="Email" className={styles.lead}>
                    <span className={styles.name}>{m.email}</span>
                  </td>
                  <td data-label="Role">{ROLE[m.role].name}</td>
                  <td data-label="Account">{m.has_account ? 'Signed up' : 'Not signed up yet'}</td>
                  <td data-label="Added">{m.added_at ? `${day(m.added_at)} by ${m.added_by}` : 'Server settings'}</td>
                  {editable ? (
                    <td data-label="" className={styles.rowActions}>
                      {m.editable ? (
                        <div className={styles.actions}>
                          <Button variant="secondary" onClick={() => void setRole(m.email, m.role === 'support' ? 'moderator' : 'support')}>
                            Make {m.role === 'support' ? 'moderator' : 'support'}
                          </Button>
                          <Button variant="secondary" onClick={() => void remove(m)}>
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

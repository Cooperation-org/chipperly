'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AccountMembersResponse } from '@chipperly/shared/schemas/account';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { api } from '@/lib/api/client';
import { db } from '@/lib/db/db';
import { useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { InviteSheet } from './InviteSheet';
import styles from './CareTeamScreen.module.css';

/** S26: care team members and pending invites, admin only. */
export function CareTeamScreen() {
  const { open, close } = useSheet();
  const { accounts } = useSession();
  const { profile } = useActiveProfile();
  const accountId = profile?.account_id;
  const isAdmin = accounts.find((a) => a.account.id === accountId)?.role === 'admin';

  const [data, setData] = useState<AccountMembersResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const profiles = useLiveQuery(() => (accountId ? db.profiles.where('account_id').equals(accountId).toArray() : []), [accountId], []);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // Fetch on mount, on account change, and whenever an action below bumps
  // refreshKey. setData is only reached after the await, inside a cleanup-
  // guarded IIFE, so a stale response from a superseded fetch is dropped.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void (async () => {
      const res = await api.get<AccountMembersResponse>(`/accounts/${accountId}/members`);
      if (!cancelled) setData(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshKey]);

  function refetch(): void {
    setRefreshKey((k) => k + 1);
  }

  if (!accountId) return null;

  if (!isAdmin) {
    return <p className={styles.memberNote}>Only an account admin can see the care team.</p>;
  }

  async function removeMember(userId: string, name: string): Promise<void> {
    close();
    await api.delete(`/accounts/${accountId}/members/${userId}`);
    toast(`Removed ${name}`);
    refetch();
  }

  async function resendInvite(inviteId: string): Promise<void> {
    await api.post(`/accounts/${accountId}/invites/${inviteId}/resend`);
    toast('Invite resent');
    refetch();
  }

  async function cancelInvite(inviteId: string): Promise<void> {
    await api.delete(`/accounts/${accountId}/invites/${inviteId}`);
    refetch();
  }

  return (
    <div className={styles.page}>
      <BigButton
        fullWidth
        icon="plus"
        onClick={() =>
          open(<InviteSheet accountId={accountId} profiles={profiles} onSent={() => refetch()} />, { title: 'Invite' })
        }
      >
        Invite
      </BigButton>

      {data && data.members.length > 0 ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Members</span>
          <div className={styles.card}>
            {data.members.map((m) => (
              <div key={m.user.id} className={styles.memberRow}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{m.user.display_name}</span>
                  <span className={styles.memberRole}>{m.role}</span>
                  <div className={styles.tiles}>
                    {m.profile_ids.map((pid) => {
                      const p = profileById.get(pid);
                      if (!p) return null;
                      return (
                        <span key={pid} className={styles.tileItem}>
                          <Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />
                          <span className={styles.tileName}>Sees: {p.name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                {m.role !== 'admin' || data.members.filter((x) => x.role === 'admin').length > 1 ? (
                  <IconButton
                    icon="close"
                    aria-label={`Remove ${m.user.display_name}`}
                    onClick={() =>
                      open(
                        <Confirm
                          title={`Remove ${m.user.display_name}`}
                          body="Their created activities, rewards and history stay in the account."
                          confirmLabel={`Remove ${m.user.display_name}`}
                          danger
                          onConfirm={() => void removeMember(m.user.id, m.user.display_name)}
                          onCancel={close}
                        />,
                      )
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data && data.invites.length > 0 ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Pending invites</span>
          <div className={styles.card}>
            {data.invites.map((inv) => (
              <div key={inv.id} className={styles.inviteRow}>
                <div className={styles.inviteInfo}>
                  <span className={styles.inviteEmail}>{inv.email}</span>
                  <p className={styles.inviteHint}>{inv.role}</p>
                </div>
                <div className={styles.memberActions}>
                  <Button variant="secondary" onClick={() => void resendInvite(inv.id)}>
                    Resend
                  </Button>
                  <IconButton icon="close" aria-label={`Cancel invite to ${inv.email}`} onClick={() => void cancelInvite(inv.id)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data && data.members.length === 0 && data.invites.length === 0 ? (
        <p className={styles.memberNote}>No one else has access yet.</p>
      ) : null}
    </div>
  );
}

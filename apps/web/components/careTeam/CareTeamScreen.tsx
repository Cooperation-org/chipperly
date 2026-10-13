'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { InviteIssuedSchema, type AccountMembersResponse, type InviteIssued } from '@chipperly/shared/schemas/account';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { api } from '@/lib/api/client';
import { db } from '@/lib/db/db';
import { canManageMember, groupsToOffer, roleLabel } from '@/lib/auth/roleRules';
import { useSession } from '@/lib/auth/session';
import { activeClusters, type Cluster } from '@/lib/org/roster';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { InviteSheet } from './InviteSheet';
import { EditMemberSheet } from './EditMemberSheet';
import { EditMemberLocationSheet } from './EditMemberLocationSheet';
import styles from './CareTeamScreen.module.css';

/** S26: care team members and pending invites. Admins, and moderators inside their own groups. */
export function CareTeamScreen() {
  const { open, replace, close } = useSheet();
  const { accounts, user } = useSession();
  const { profile } = useActiveProfile();
  const accountId = profile?.account_id;
  const mine = accounts.find((a) => a.account.id === accountId);
  const callerRole = mine?.role;
  const accountKind = mine?.account.kind;
  const inOrg = accountKind === 'agency';
  const canOpen = callerRole === 'admin' || (inOrg && callerRole === 'moderator');
  const ownerId = mine?.account.owner_user_id ?? null;

  const [data, setData] = useState<AccountMembersResponse | null>(null);
  const [groups, setGroups] = useState<Cluster[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const profiles = useLiveQuery(() => (accountId ? db.profiles.where('account_id').equals(accountId).toArray() : []), [accountId], []);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const profileIds = profiles.map((p) => p.id);
  const locations = useLiveQuery(
    () => (profileIds.length > 0 ? db.locations.where('profile_id').anyOf(profileIds).toArray() : []),
    [profileIds.join(',')],
    [],
  );
  const locationById = new Map(locations.map((l) => [l.id, l]));
  function locationName(id: string): string | null {
    return locationById.get(id)?.name ?? null;
  }

  // Fetch on mount, on account change, and whenever an action below bumps
  // refreshKey. setData is only reached after the await, inside a cleanup-
  // guarded IIFE, so a stale response from a superseded fetch is dropped.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void (async () => {
      const res = await api.get<AccountMembersResponse>(`/accounts/${accountId}/members`);
      const rows = inOrg ? (await api.get<{ clusters: Cluster[] }>(`/accounts/${accountId}/clusters`)).clusters : [];
      if (cancelled) return;
      setData(res);
      setGroups(activeClusters(rows));
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshKey, inOrg]);

  function refetch(): void {
    setRefreshKey((k) => k + 1);
  }

  if (!accountId) return null;

  if (!canOpen) {
    return <p className={styles.memberNote}>{inOrg ? 'Only an admin or moderator can see the team.' : 'Only an account admin can see the team.'}</p>;
  }

  // A moderator's own groups and the people they see: what they are allowed to hand out and edit.
  const self = data?.members.find((m) => m.user.id === user?.id);
  const scope = { groups: new Set(self?.cluster_ids ?? []), profiles: new Set(profileIds) };
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const offered = groupsToOffer(callerRole, groups, scope.groups);
  const adminCount = data?.members.filter((x) => x.role === 'admin').length ?? 0;

  async function removeMember(userId: string, name: string): Promise<void> {
    close();
    await api.delete(`/accounts/${accountId}/members/${userId}`);
    toast(`Removed ${name}`);
    refetch();
  }

  function removeConfirm(userId: string, name: string) {
    return (
      <Confirm
        title={`Remove ${name}`}
        body="Their created activities, rewards and history stay in the account."
        confirmLabel={`Remove ${name}`}
        danger
        onConfirm={() => void removeMember(userId, name)}
        onCancel={close}
      />
    );
  }

  async function resendInvite(inviteId: string): Promise<void> {
    const issued = await api.post<InviteIssued>(`/accounts/${accountId}/invites/${inviteId}/resend`, undefined, {
      schema: InviteIssuedSchema,
    });
    // Either way the server rotated the token and pushed out expires_at.
    refetch();
    if (issued.email_sent) {
      toast('Invite resent');
      return;
    }
    // No mail provider on this server: the link is the only way in, so put it on the clipboard.
    await navigator.clipboard?.writeText(issued.invite_url);
    toast("Email isn't set up here. Link copied, send it to them yourself.");
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
        // The sheet is opened with the groups known right now, so wait for the members and groups fetch.
        disabled={!data}
        onClick={() =>
          open(<InviteSheet accountId={accountId} profiles={profiles} onSent={() => refetch()} accountKind={accountKind} callerRole={callerRole} groups={offered} />, { title: 'Invite' })
        }
      >
        Invite
      </BigButton>

      {data && data.members.length > 0 ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Members</span>
          <div className={styles.card}>
            {data.members.map((m) => {
              const manageable = canManageMember({ role: callerRole }, { role: m.role, cluster_ids: m.cluster_ids, profile_ids: m.profiles.map((x) => x.profile_id) }, scope);
              const canRemove = manageable && (m.role !== 'admin' || adminCount > 1);
              const memberGroups = (m.cluster_ids ?? []).map((id) => groupName.get(id)).filter(Boolean);
              const summary = (
                <>
                  <span className={styles.memberName}>{m.user.display_name}</span>
                  <span className={styles.memberRole}>
                    {roleLabel(m.role, accountKind, ownerId === m.user.id)}
                    {m.role === 'admin' ? ' · sees everyone' : m.profiles.length === 0 && memberGroups.length === 0 ? ' · sees no one yet' : ''}
                    {memberGroups.length > 0 ? ` · ${memberGroups.join(', ')}` : ''}
                  </span>
                </>
              );
              return (
              <div key={m.user.id} className={styles.memberRow}>
                <div className={styles.memberInfo}>
                  {manageable ? (
                  <button
                    type="button"
                    className={styles.memberEdit}
                    aria-label={`Edit ${m.user.display_name}`}
                    onClick={() =>
                      open(
                        <EditMemberSheet
                          accountId={accountId}
                          member={m}
                          profiles={profiles}
                          canRemove={canRemove}
                          onSaved={refetch}
                          onRemove={() => replace(removeConfirm(m.user.id, m.user.display_name))}
                          accountKind={accountKind}
                          callerRole={callerRole}
                          groups={offered}
                        />,
                        { title: m.user.display_name },
                      )
                    }
                  >
                    {summary}
                  </button>
                  ) : (
                    <div className={styles.memberEdit}>{summary}</div>
                  )}
                  <div className={styles.tiles}>
                    {m.profiles.map((mp) => {
                      const p = profileById.get(mp.profile_id);
                      if (!p) return null;
                      const location = mp.assigned_location_id ? locationName(mp.assigned_location_id) : null;
                      // Admins have no profile_members row (they see every profile
                      // implicitly) so there's nothing here to assign a location to.
                      if (m.role === 'admin') {
                        return (
                          <span key={mp.profile_id} className={styles.tileItem}>
                            <Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />
                            <span className={styles.tileName}>Sees: {p.name}</span>
                          </span>
                        );
                      }
                      return (
                        <button
                          key={mp.profile_id}
                          type="button"
                          className={styles.tileItem}
                          onClick={() =>
                            open(
                              <EditMemberLocationSheet
                                accountId={accountId}
                                userId={m.user.id}
                                memberName={m.user.display_name}
                                profileId={p.id}
                                profileName={p.name}
                                current={mp}
                                onSaved={refetch}
                              />,
                              { title: 'Assigned location' },
                            )
                          }
                        >
                          <Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />
                          <span className={styles.tileName}>
                            Sees: {p.name}
                            {location ? <span className={styles.tileLocation}> · {location}</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {canRemove ? (
                  <IconButton
                    icon="close"
                    aria-label={`Remove ${m.user.display_name}`}
                    onClick={() => open(removeConfirm(m.user.id, m.user.display_name))}
                  />
                ) : null}
              </div>
              );
            })}
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
                  <p className={styles.inviteHint}>{roleLabel(inv.role, accountKind)}</p>
                </div>
                {canManageMember({ role: callerRole }, { role: inv.role, cluster_ids: inv.cluster_ids, profile_ids: inv.profile_ids }, scope) ? (
                  <div className={styles.memberActions}>
                    <Button variant="secondary" onClick={() => void resendInvite(inv.id)}>
                      Resend
                    </Button>
                    <IconButton icon="close" aria-label={`Cancel invite to ${inv.email}`} onClick={() => void cancelInvite(inv.id)} />
                  </div>
                ) : null}
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

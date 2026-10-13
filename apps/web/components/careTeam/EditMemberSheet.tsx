'use client';

import { useState } from 'react';
import type { AccountMember, Role } from '@chipperly/shared/schemas/account';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { ListRow } from '@/components/ui/ListRow';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { api, ApiError } from '@/lib/api/client';
import { roleHint } from '@/lib/auth/roleRules';
import type { Cluster } from '@/lib/org/roster';
import { GroupChecklist } from './GroupChecklist';
import { groupIdsToSave, missingPersonError, profileIdsToSave, roleItemsFor } from './roles';
import styles from './InviteSheet.module.css';

export interface EditMemberSheetProps {
  accountId: string;
  member: AccountMember;
  profiles: Profile[];
  /** False for the last admin. */
  canRemove: boolean;
  onSaved: () => void;
  onRemove: () => void;
  /** 'agency' offers Moderator, org role names and groups. */
  accountKind?: string;
  /** A moderator can only set Staff and Family, inside their own groups. */
  callerRole?: Role;
  /** The groups the signed-in user can hand out (a moderator is only sent their own). */
  groups?: Cluster[];
}

/** Change a team member's role, which groups and people they see, and their relationship label. */
export function EditMemberSheet({ accountId, member, profiles, canRemove, onSaved, onRemove, accountKind, callerRole = 'admin', groups = [] }: EditMemberSheetProps) {
  const { close } = useSheet();
  const inOrg = accountKind === 'agency';
  const initialIds = member.profiles.map((p) => p.profile_id);
  const initialGroups = member.cluster_ids ?? [];
  const [role, setRole] = useState<Role>(member.role);
  const [ids, setIds] = useState<Set<string>>(() => new Set(initialIds));
  const [groupIds, setGroupIds] = useState<Set<string>>(() => new Set(initialGroups));
  const [relationship, setRelationship] = useState(member.profiles[0]?.relationship_label ?? '');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  function toggle(id: string): void {
    setIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string): void {
    setGroupIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(): Promise<void> {
    const missing = missingPersonError(role, ids, inOrg ? groupIds.size : 0, inOrg);
    if (missing) {
      setError(missing);
      return;
    }
    setError(undefined);
    setSaving(true);
    // Only send the list when it changed: the server rebuilds the rows, which clears location assignments.
    const profile_ids = profileIdsToSave(member.role, role, initialIds, ids);
    const cluster_ids = inOrg ? groupIdsToSave(role, initialGroups, groupIds) : undefined;
    try {
      const patch = (): Promise<unknown> =>
        api.patch(`/accounts/${accountId}/members/${member.user.id}`, {
          role,
          relationship_label: relationship.trim() || null,
          ...(profile_ids ? { profile_ids } : {}),
        });
      const putGroups = (): Promise<unknown> => api.put(`/accounts/${accountId}/members/${member.user.id}/groups`, { cluster_ids });
      // A moderator can only edit someone who still has access inside their groups, so add groups before the
      // list is saved and drop them after. An admin has no groups to set until the role change lands, so it goes first.
      if (cluster_ids && cluster_ids.length > 0 && member.role !== 'admin') {
        await putGroups();
        await patch();
      } else {
        await patch();
        if (cluster_ids) await putGroups();
      }
      onSaved();
      close();
    } catch (err) {
      // The server words the limit and last-admin messages, so show them as sent.
      if (err instanceof ApiError && (err.code === 'admin_limit' || err.code === 'last_admin')) setError(err.message);
      else if (err instanceof ApiError && err.status === 403) setError('You can only change Staff and Family inside your own groups.');
      else setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.sheet}>
      <div>
        <span className={styles.label}>Role</span>
        <Segmented label="Role" value={role} onChange={(v) => setRole(v as Role)} items={roleItemsFor(accountKind, callerRole)} />
        <p className={styles.hint}>{roleHint(role, accountKind)}</p>
      </div>
      {inOrg && role !== 'admin' && groups.length > 0 ? <GroupChecklist groups={groups} selected={groupIds} onToggle={toggleGroup} /> : null}
      {role !== 'admin' ? (
        <div>
          <span className={styles.label}>{inOrg && groups.length > 0 ? 'Or people one by one' : 'Who they see'}</span>
          <div className={styles.checklist}>
            {profiles.map((p) => (
              <ListRow
                key={p.id}
                tile={<Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />}
                name={p.name}
                trailing={<CheckCircle checked={ids.has(p.id)} onChange={() => toggle(p.id)} name={p.name} />}
                onTap={() => toggle(p.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <TextField label="Relationship (optional)" placeholder="Speech therapist" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
      {error ? (
        <p role="alert" className={styles.offline}>
          {error}
        </p>
      ) : null}
      <BigButton fullWidth onClick={() => void save()} disabled={saving}>
        Save
      </BigButton>
      {canRemove ? (
        <Button variant="secondary" onClick={onRemove}>
          Remove {member.user.display_name}
        </Button>
      ) : null}
    </div>
  );
}

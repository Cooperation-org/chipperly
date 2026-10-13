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
import { profileIdsToSave, ROLE_HINT, ROLE_ITEMS } from './roles';
import styles from './InviteSheet.module.css';

export interface EditMemberSheetProps {
  accountId: string;
  member: AccountMember;
  profiles: Profile[];
  /** False for the last admin. */
  canRemove: boolean;
  onSaved: () => void;
  onRemove: () => void;
}

/** Change a team member's role, which people they see, and their relationship label. */
export function EditMemberSheet({ accountId, member, profiles, canRemove, onSaved, onRemove }: EditMemberSheetProps) {
  const { close } = useSheet();
  const initialIds = member.profiles.map((p) => p.profile_id);
  const [role, setRole] = useState<Role>(member.role);
  const [ids, setIds] = useState<Set<string>>(() => new Set(initialIds));
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

  async function save(): Promise<void> {
    setError(undefined);
    setSaving(true);
    // Only send the list when it changed: the server rebuilds the rows, which clears location assignments.
    const profile_ids = profileIdsToSave(member.role, role, initialIds, ids);
    try {
      await api.patch(`/accounts/${accountId}/members/${member.user.id}`, {
        role,
        relationship_label: relationship.trim() || null,
        ...(profile_ids ? { profile_ids } : {}),
      });
      onSaved();
      close();
    } catch (err) {
      // The server words the limit and last-admin messages, so show them as sent.
      if (err instanceof ApiError && (err.code === 'admin_limit' || err.code === 'last_admin')) setError(err.message);
      else setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.sheet}>
      <div>
        <span className={styles.label}>Role</span>
        <Segmented label="Role" value={role} onChange={(v) => setRole(v as Role)} items={ROLE_ITEMS} />
        <p className={styles.hint}>{ROLE_HINT[role]}</p>
      </div>
      {role !== 'admin' ? (
        <div>
          <span className={styles.label}>Who they see</span>
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

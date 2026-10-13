'use client';

import { useState } from 'react';
import { InviteIssuedSchema, type InviteIssued, type Role } from '@chipperly/shared/schemas/account';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { ListRow } from '@/components/ui/ListRow';
import { QrCode } from '@/components/ui/QrCode';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { api, ApiError } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { useOnline } from '@/lib/device/online';
import { roleHint } from '@/lib/auth/roleRules';
import type { Cluster } from '@/lib/org/roster';
import { GroupChecklist } from './GroupChecklist';
import { missingPersonError, roleItemsFor } from './roles';
import styles from './InviteSheet.module.css';

export interface InviteSheetProps {
  accountId: string;
  profiles: Profile[];
  onSent: () => void;
  /** 'agency' offers Moderator, org role names and groups. */
  accountKind?: string;
  /** A moderator can only invite Staff and Family into their own groups. */
  callerRole?: Role;
  /** The groups the signed-in user can hand out (a moderator is only sent their own). */
  groups?: Cluster[];
}

/**
 * S27: invite a caregiver by email, then show the accept link so the admin
 * can also send it by text (or must, when the server has no mail provider).
 * No offline queue in v1 (this task's brief).
 */
export function InviteSheet({ accountId, profiles, onSent, accountKind, callerRole = 'admin', groups = [] }: InviteSheetProps) {
  const { close } = useSheet();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [profileIds, setProfileIds] = useState<Set<string>>(
    () => new Set(profiles.length === 1 ? [profiles[0].id] : []),
  );
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [relationship, setRelationship] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState<InviteIssued | null>(null);

  function toggleProfile(id: string): void {
    setProfileIds((cur) => {
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

  const inOrg = accountKind === 'agency';
  const items = roleItemsFor(accountKind, callerRole);

  async function send(): Promise<void> {
    setError(undefined);
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    const missing = missingPersonError(role, profileIds, inOrg ? groupIds.size : 0, inOrg);
    if (missing) {
      setError(missing);
      return;
    }
    setSending(true);
    try {
      const result = await api.post<InviteIssued>(
        `/accounts/${accountId}/invites`,
        {
          email: email.trim(),
          role,
          profile_ids: role !== 'admin' ? Array.from(profileIds) : profiles.map((p) => p.id),
          ...(inOrg && role !== 'admin' && groupIds.size > 0 ? { cluster_ids: Array.from(groupIds) } : {}),
          relationship_label: relationship.trim() || null,
        },
        { schema: InviteIssuedSchema },
      );
      onSent();
      setIssued(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'admin_limit') setError(`${err.message}. Invite them as Support team or Viewer instead, or remove an admin first.`);
      else if (err instanceof ApiError && err.status === 403) setError('You can only invite people into your own groups.');
      else setError(err instanceof ApiError ? "Couldn't send the invite. Check the email address and try again." : "Couldn't send the invite. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (issued) {
    return (
      <div className={styles.sheet}>
        <p className={styles.sent}>
          {issued.email_sent
            ? `Invite sent to ${issued.email}. If it doesn't arrive, send them this link instead.`
            : `Email isn't set up on this server, so send ${issued.email} this link yourself. It works for 7 days.`}
        </p>
        <input className={styles.linkField} readOnly value={issued.invite_url} onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <div className={styles.qrRow}>
          <QrCode value={issued.invite_url} size={160} />
          <p className={styles.qrHint}>Or scan this with their phone&rsquo;s camera</p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(issued.invite_url);
              toast('Copied');
            }}
          >
            Copy link
          </Button>
          <BigButton fullWidth onClick={close}>
            Done
          </BigButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sheet}>
      <TextField label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoFocus />
      <div>
        <span className={styles.label}>Role</span>
        <Segmented label="Role" value={role} onChange={(v) => setRole(v as Role)} items={items} />
        <p className={styles.hint}>{roleHint(role, accountKind)}</p>
      </div>
      {inOrg && role !== 'admin' && groups.length > 0 ? <GroupChecklist groups={groups} selected={groupIds} onToggle={toggleGroup} /> : null}
      {role !== 'admin' ? (
        <div>
          <span className={styles.label}>{inOrg && groups.length > 0 ? 'Or pick people one by one' : 'Who they see'}</span>
          <div className={styles.checklist}>
            {profiles.map((p) => (
              <ListRow
                key={p.id}
                tile={<Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />}
                name={p.name}
                trailing={<CheckCircle checked={profileIds.has(p.id)} onChange={() => toggleProfile(p.id)} name={p.name} />}
                onTap={() => toggleProfile(p.id)}
              />
            ))}
          </div>
          <TextField
            label="Relationship (optional)"
            placeholder="Speech therapist"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        </div>
      ) : null}
      {!online ? <p className={styles.offline}>No queue for invites yet, so this needs a connection.</p> : null}
      <BigButton fullWidth onClick={() => void send()} disabled={!online || sending}>
        {online ? 'Send' : 'Offline. Try again when connected'}
      </BigButton>
    </div>
  );
}

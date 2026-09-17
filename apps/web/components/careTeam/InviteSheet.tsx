'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { ListRow } from '@/components/ui/ListRow';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { api, ApiError } from '@/lib/api/client';
import styles from './InviteSheet.module.css';

export interface InviteSheetProps {
  accountId: string;
  profiles: Profile[];
  onSent: () => void;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    function set(): void {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    };
  }, []);
  return online;
}

/** S27: invite a caregiver by email. No offline queue in v1 (this task's brief). */
export function InviteSheet({ accountId, profiles, onSent }: InviteSheetProps) {
  const { close } = useSheet();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [profileIds, setProfileIds] = useState<Set<string>>(new Set());
  const [relationship, setRelationship] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  function toggleProfile(id: string): void {
    setProfileIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(): Promise<void> {
    setError(undefined);
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setSending(true);
    try {
      await api.post(`/accounts/${accountId}/invites`, {
        email: email.trim(),
        role,
        profile_ids: role === 'member' ? Array.from(profileIds) : profiles.map((p) => p.id),
        relationship_label: relationship.trim() || null,
      });
      onSent();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? "Couldn't send the invite. Check the email address and try again." : "Couldn't send the invite. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.sheet}>
      <TextField label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoFocus />
      <div>
        <span className={styles.label}>Role</span>
        <Segmented
          label="Role"
          value={role}
          onChange={(v) => setRole(v as 'admin' | 'member')}
          items={[
            { value: 'admin', label: 'Admin' },
            { value: 'member', label: 'Member' },
          ]}
        />
      </div>
      {role === 'member' ? (
        <div>
          <span className={styles.label}>Which profiles</span>
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

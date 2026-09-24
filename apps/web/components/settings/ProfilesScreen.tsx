'use client';

import { useState } from 'react';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { PROFILE_LIMITS } from '@chipperly/shared/constants/limits';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { api, ApiError } from '@/lib/api/client';
import { useSession, refreshMe } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import styles from './ProfilesScreen.module.css';
import { UsesAppSwitch } from './UsesAppSwitch';

function AddProfileSheet({ accountId, onCreated }: { accountId: string; onCreated: (profile: Profile) => void }) {
  const { close } = useSheet();
  const [name, setName] = useState('');
  const [picture, setPicture] = useState<PicturePickerValue>({});
  const [usesApp, setUsesApp] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit(): Promise<void> {
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const profile = await api.post<Profile>(`/accounts/${accountId}/profiles`, {
        name: name.trim(),
        emoji: picture.emoji ?? null,
        photo_id: picture.photo_id ?? null,
        child_uses_app: usesApp,
      });
      await refreshMe();
      onCreated(profile);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.addForm}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
      <PicturePicker value={picture} onChange={setPicture} name={name || 'New profile'} />
      <UsesAppSwitch name={name} checked={usesApp} onChange={setUsesApp} />
      <BigButton fullWidth onClick={() => void submit()} disabled={saving}>
        Create
      </BigButton>
    </div>
  );
}

/** S21: profiles the user can see, switch or add. */
export function ProfilesScreen() {
  const { open, close } = useSheet();
  const { accounts } = useSession();
  const { profile, profiles, setActiveProfileId } = useActiveProfile();

  const targetAccountId = profile?.account_id ?? accounts[0]?.account.id;
  const targetAccount = accounts.find((a) => a.account.id === targetAccountId);
  const isAdmin = targetAccount?.role === 'admin';
  const countInAccount = profiles.filter((p) => p.account_id === targetAccountId).length;
  const limit = targetAccount ? PROFILE_LIMITS[targetAccount.account.kind] : 0;
  const atLimit = countInAccount >= limit;

  return (
    <div className={styles.page}>
      <div className={styles.list}>
        {profiles.map((p) => {
          const current = p.id === profile?.id;
          return (
            <button
              key={p.id}
              type="button"
              className={styles.row}
              aria-current={current || undefined}
              onClick={() => {
                setActiveProfileId(p.id);
                toast(`Switched to ${p.name}`);
              }}
            >
              <Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />
              {p.name}
              {current ? <Icon name="check" size={20} className={styles.check} title="Current profile" /> : null}
            </button>
          );
        })}
      </div>

      {!targetAccountId ? null : !isAdmin ? (
        <p className={styles.limitNote}>Only an account admin can add a profile.</p>
      ) : atLimit ? (
        <p className={styles.limitNote}>
          This {targetAccount?.account.kind} account is limited to {limit} profile{limit === 1 ? '' : 's'}.
        </p>
      ) : (
        <BigButton
          fullWidth
          icon="plus"
          onClick={() =>
            open(
              <AddProfileSheet
                accountId={targetAccountId}
                onCreated={(p) => {
                  setActiveProfileId(p.id);
                  close();
                }}
              />,
              { title: 'Add child' },
            )
          }
        >
          Add child
        </BigButton>
      )}
    </div>
  );
}

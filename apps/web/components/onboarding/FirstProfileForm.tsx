'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { api } from '@/lib/api/client';
import { useKv } from '@/lib/db/kv';
import { refreshMe } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { UsesAppSwitch } from '@/components/settings/UsesAppSwitch';
import styles from './FirstProfileForm.module.css';

/** kv key documented in CONTRACTS.md's lib/db/db.ts; set by S3 (KindPicker) via useActiveAccount().setActiveAccountId. */
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

/** S4: first profile, for household and agency accounts. */
export function FirstProfileForm() {
  const router = useRouter();
  const accountId = useKv<string | null>(ACTIVE_ACCOUNT_KEY, null);
  const { setActiveProfileId } = useActiveProfile();
  const [name, setName] = useState('');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: null, photo_id: null });
  const [usesApp, setUsesApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!accountId) {
      setError('Something went wrong. Start over.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const profile = await api.post<Profile>(`/accounts/${accountId}/profiles`, {
        name,
        emoji: picture.emoji ?? null,
        photo_id: picture.photo_id ?? null,
        child_uses_app: usesApp,
      });
      await refreshMe();
      setActiveProfileId(profile.id);
      router.push('/onboarding/ready/');
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <h1 className={styles.title}>Who is this for?</h1>
        <p className={styles.subtitle}>Personalize their visual routine workspace.</p>
      </div>
      <TextField label="Name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
      <PicturePicker value={picture} onChange={setPicture} name={name} choices={AVATAR_EMOJI} />
      <UsesAppSwitch name={name} checked={usesApp} onChange={setUsesApp} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
          {!accountId ? (
            <>
              {' '}
              <Link href="/onboarding/kind/" className={styles.link}>
                Go back
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={loading} disabled={name.trim().length === 0}>
        Continue
      </Button>
    </form>
  );
}

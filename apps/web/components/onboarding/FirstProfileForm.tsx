'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Profile, SetupAnswers } from '@chipperly/shared/schemas/profile';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { api, TimeoutError, TIMEOUT_MESSAGE } from '@/lib/api/client';
import { setKv, useKv } from '@/lib/db/kv';
import { refreshMe, useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { saveGuidedSetup, type GuidedPicks } from '@/lib/profile/guidedSetup';
import { toast } from '@/lib/toast';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { UsesAppSwitch } from '@/components/settings/UsesAppSwitch';
import { SetupQuestions } from './SetupQuestions';
import styles from './FirstProfileForm.module.css';

/** kv key documented in CONTRACTS.md's lib/db/db.ts; set by S3 (KindPicker) via useActiveAccount().setActiveAccountId. */
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

/** kv key: the setup interview's answers (or null for skipped), read once by S5 (Ready) for its summary. */
export const SETUP_ANSWERS_KEY = 'onboarding_setup';

/**
 * S4: first profile. Household and agency accounts fill in a name and picture
 * first; a "Myself" account is its own profile, so it goes straight to the
 * setup interview (S4b, SetupQuestions), which both paths finish with.
 */
export function FirstProfileForm() {
  const router = useRouter();
  const accountId = useKv<string | null>(ACTIVE_ACCOUNT_KEY, null);
  const { user, accounts } = useSession();
  const { setActiveProfileId } = useActiveProfile();
  const account = accounts.find((a) => a.account.id === accountId)?.account;
  const selfMode = account?.kind === 'individual';

  const [phase, setPhase] = useState<'details' | 'setup'>('details');
  const [name, setName] = useState('');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: null, photo_id: null });
  const [usesApp, setUsesApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(setup: SetupAnswers | null, picks?: GuidedPicks): Promise<void> {
    if (!accountId) {
      setError('Something went wrong. Start over.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const profile = await api.post<Profile>(`/accounts/${accountId}/profiles`, {
        name: selfMode ? (user?.display_name ?? name) : name,
        emoji: selfMode ? '🙂' : (picture.emoji ?? null),
        photo_id: selfMode ? null : (picture.photo_id ?? null),
        child_uses_app: selfMode ? true : usesApp,
        ...(setup ? { setup } : {}),
      });
      await setKv(SETUP_ANSWERS_KEY, setup);
      // The profile exists server-side now; a slow refresh must not fail the step (and a retry would add a second profile).
      await refreshMe().catch(() => undefined);
      setActiveProfileId(profile.id);
      // The server made no locations or rewards for guided answers; they are created here, with their photos.
      if (picks) await saveGuidedSetup(profile.id, picks).catch(() => toast("Couldn't save the places and rewards. Add them in settings.", { carry: true }));
      router.push('/onboarding/ready/');
    } catch (err) {
      setError(err instanceof TimeoutError ? TIMEOUT_MESSAGE : "Couldn't save that. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setPhase('setup');
  }

  const errorLine = error ? (
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
  ) : null;

  // The account row hasn't loaded yet; rendering the wrong branch for a
  // moment would flash the name form at a "Myself" account.
  if (accountId && !account) return null;

  if (selfMode || phase === 'setup') {
    return (
      <div className={styles.form}>
        <SetupQuestions
          name={selfMode ? (user?.display_name ?? 'you') : name}
          selfMode={selfMode}
          busy={loading}
          onDone={(answers, picks) => void create(answers, picks)}
          onBack={selfMode ? undefined : () => setPhase('details')}
        />
        {errorLine}
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div>
        <h1 className={styles.title}>What&apos;s their name?</h1>
        <p className={styles.subtitle}>Personalize their visual routine workspace.</p>
      </div>
      <TextField label="Name" hint="A first name or nickname is fine. It stays in your account and isn't shared." autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
      <PicturePicker value={picture} onChange={setPicture} name={name} choices={AVATAR_EMOJI} />
      <UsesAppSwitch name={name} checked={usesApp} onChange={setUsesApp} />
      {errorLine}
      <Button type="submit" fullWidth disabled={name.trim().length === 0}>
        Continue
      </Button>
    </form>
  );
}

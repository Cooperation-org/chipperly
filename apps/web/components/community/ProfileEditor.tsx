'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api/client';
import { BIO_MAX, bioToBody, fetchMyProfile, saveMyProfile, validateBio, type MyProfile } from '@/lib/data/community';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import styles from './ProfileEditor.module.css';

/** /settings/community/: your public avatar and bio. Shown once a nickname exists. */
export function ProfileEditor() {
  const { profile } = useActiveProfile();
  const name = profile?.name ?? 'your child';
  const bioId = useId();
  const [saved, setSaved] = useState<MyProfile | null | undefined>(undefined);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * A promise chain, not an async function called straight from the effect: the
   * writes then happen in `.then` rather than somewhere React can reach
   * synchronously during the effect, which costs an extra render pass.
   * `isLive` keeps a late reply off an unmounted screen.
   */
  const load = useCallback(
    (isLive: () => boolean): Promise<void> =>
      fetchMyProfile().then(
        (me) => {
          if (!isLive()) return;
          setSaved(me);
          setAvatar(me.avatar_emoji);
          setBio(me.bio ?? '');
        },
        () => {
          if (isLive()) setSaved(null);
        },
      ),
    [],
  );

  useEffect(() => {
    let live = true;
    void load(() => live);
    return () => {
      live = false;
    };
  }, [load]);

  if (saved === undefined) return null;
  if (saved === null) {
    return (
      <p className={styles.muted} role="alert">
        Couldn&rsquo;t load your profile. The community needs a connection.
      </p>
    );
  }
  if (!saved.nickname) return null;

  const bioError = validateBio(bio);
  const dirty = avatar !== saved.avatar_emoji || bioToBody(bio) !== saved.bio;

  async function save(): Promise<void> {
    if (bioError) return;
    setSaving(true);
    setError(null);
    try {
      const body = { avatar_emoji: avatar, bio: bioToBody(bio) };
      await saveMyProfile(body);
      setSaved((prev) => (prev ? { ...prev, ...body } : prev));
      setBio(body.bio ?? '');
      toast('Profile saved');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.wrap}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className={styles.heading}>Your public profile</h2>
      <p className={styles.warning}>Anyone can see this. Don&rsquo;t use your real name or {name}&rsquo;s.</p>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Avatar</legend>
        <div className={styles.picker}>
          <label className={styles.choice}>
            <input
              type="radio"
              name="avatar"
              className={styles.radio}
              checked={avatar === null}
              onChange={() => setAvatar(null)}
            />
            <span className={`${styles.face} ${styles.none}`}>None</span>
          </label>
          {AVATAR_EMOJI.map((emoji) => (
            <label key={emoji} className={styles.choice}>
              <input
                type="radio"
                name="avatar"
                className={styles.radio}
                aria-label={emoji}
                checked={avatar === emoji}
                onChange={() => setAvatar(emoji)}
              />
              <span className={styles.face} aria-hidden="true">
                {emoji}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.field}>
        <label htmlFor={bioId} className={styles.legend}>
          Bio
        </label>
        <textarea
          id={bioId}
          className={styles.textarea}
          rows={4}
          maxLength={BIO_MAX}
          value={bio}
          aria-describedby={`${bioId}-count`}
          aria-invalid={bioError ? true : undefined}
          onChange={(e) => {
            setBio(e.target.value);
            setError(null);
          }}
        />
        <div className={styles.row}>
          <span id={`${bioId}-count`} className={bioError ? styles.countOver : styles.muted}>
            {bio.trim().length} / {BIO_MAX}
          </span>
          {bio !== '' ? (
            <Button variant="ghost" onClick={() => setBio('')}>
              Clear bio
            </Button>
          ) : null}
        </div>
        {bioError ? (
          <p className={styles.errorText} role="alert">
            {bioError}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={saving} disabled={!dirty || bioError !== null}>
        Save profile
      </Button>
    </form>
  );
}

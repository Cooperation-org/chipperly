'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { validateNickname } from '@/lib/data/moderation';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import styles from './NicknameSetup.module.css';

interface MeResponse {
  nickname: string | null;
}

/** /settings/community/: the community nickname, chosen once. Public, never a real name. */
export function NicknameSetup() {
  const { profile } = useActiveProfile();
  const name = profile?.name ?? 'your child';
  const [nickname, setNickname] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /** `isLive` keeps a late reply from writing state after the screen has gone. */
  const refresh = useCallback(
    (isLive: () => boolean): Promise<void> =>
      api.get<MeResponse>('/community/me').then(
        (me) => {
          if (!isLive()) return;
          setNickname(me.nickname);
          setLoadError(false);
        },
        () => {
          if (isLive()) setLoadError(true);
        },
      ),
    [],
  );

  const load = useCallback((): Promise<void> => refresh(() => true), [refresh]);

  useEffect(() => {
    let live = true;
    void refresh(() => live);
    return () => {
      live = false;
    };
  }, [refresh]);

  const formatError = validateNickname(value);

  async function save(): Promise<void> {
    setTouched(true);
    if (formatError) return;
    setSaving(true);
    setServerError(null);
    try {
      const me = await api.put<MeResponse>('/community/me/nickname', { nickname: value.trim() });
      setNickname(me.nickname ?? value.trim());
      toast('Community name saved');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'nickname_already_set') await load();
      else setServerError(e instanceof ApiError ? e.message : "Couldn't save the name. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError && nickname === undefined) {
    return (
      <div className={styles.wrap}>
        <p className={styles.text} role="alert">
          Couldn&rsquo;t load your community name. The community needs a connection.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (nickname === undefined) return <p className={styles.muted}>Loading&hellip;</p>;

  if (nickname) {
    return (
      <div className={styles.wrap}>
        <p className={styles.label}>Your community name</p>
        <p className={styles.nickname} data-testid="community-nickname">
          {nickname}
        </p>
        <p className={styles.muted}>It is chosen once and can&rsquo;t be changed. Anyone can see it.</p>
      </div>
    );
  }

  return (
    <form
      className={styles.wrap}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className={styles.warning}>Anyone can see this. Don&rsquo;t use your real name or {name}&rsquo;s.</p>
      <TextField
        label="Community name"
        hint="3 to 24 letters, numbers, dashes or underscores."
        value={value}
        maxLength={24}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        error={serverError ?? (touched && formatError ? formatError : undefined)}
        onChange={(e) => {
          setValue(e.target.value);
          setServerError(null);
        }}
        onBlur={() => setTouched(true)}
      />
      <p className={styles.muted}>You choose this once. You can&rsquo;t change it later.</p>
      <Button type="submit" fullWidth loading={saving} disabled={touched && formatError !== null}>
        Save community name
      </Button>
    </form>
  );
}

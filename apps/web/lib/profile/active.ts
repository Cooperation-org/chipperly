'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Profile } from '@chipperly/shared/schemas/profile';
import type { Account } from '@chipperly/shared/schemas/account';
import { db } from '../db/db';
import { useKv, setKv } from '../db/kv';

const ACTIVE_PROFILE_KEY = 'active_profile_id';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

/** The one place the active profile changes: the active account follows the profile's account. */
export async function selectProfile(id: string): Promise<void> {
  const p = await db.profiles.get(id);
  if (p) await setKv(ACTIVE_ACCOUNT_KEY, p.account_id);
  await setKv(ACTIVE_PROFILE_KEY, id);
}

function setActiveProfileId(id: string): void {
  void selectProfile(id);
}

export interface UseActiveProfile {
  profile: Profile | undefined;
  profiles: Profile[];
  setActiveProfileId: (id: string) => void;
}

export function useActiveProfile(): UseActiveProfile {
  const activeId = useKv<string | null>(ACTIVE_PROFILE_KEY, null);
  const profiles =
    useLiveQuery(() => db.profiles.filter((row) => row.deleted_at === null).toArray(), [], []) ?? [];
  const profile = useLiveQuery(() => (activeId ? db.profiles.get(activeId) : undefined), [activeId]);

  return { profile, profiles, setActiveProfileId };
}

export interface UseActiveAccount {
  account: Account | undefined;
  accounts: Account[];
  setActiveAccountId: (id: string) => void;
}

export function useActiveAccount(): UseActiveAccount {
  const activeId = useKv<string | null>(ACTIVE_ACCOUNT_KEY, null);
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []) ?? [];
  const account = useLiveQuery(() => (activeId ? db.accounts.get(activeId) : undefined), [activeId]);

  const setActiveAccountId = (id: string): void => {
    void setKv(ACTIVE_ACCOUNT_KEY, id);
  };

  return { account, accounts, setActiveAccountId };
}

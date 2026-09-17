'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Profile } from '@chipperly/shared/schemas/profile';
import type { Account } from '@chipperly/shared/schemas/account';
import { db } from '../db/db';
import { useKv, setKv } from '../db/kv';

const ACTIVE_PROFILE_KEY = 'active_profile_id';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

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

  const setActiveProfileId = (id: string): void => {
    void setKv(ACTIVE_PROFILE_KEY, id);
  };

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

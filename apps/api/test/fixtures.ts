import { v7 as uuidv7 } from 'uuid';
import type { AccountKind, Role } from '@chipperly/shared/schemas/account';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { profiles } from '../src/db/schema/profiles.js';
import { issueTokens } from '../src/lib/tokens.js';

export interface TestUser {
  readonly id: string;
  readonly token: string;
}

export async function createUser(displayName = 'Test User'): Promise<TestUser> {
  const id = uuidv7();
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    display_name: displayName,
    created_at: Date.now(),
  });
  const tokens = await issueTokens(id);
  return { id, token: tokens.access_token };
}

export async function createAccount(ownerId: string, kind: AccountKind = 'household', name = 'Test Household'): Promise<string> {
  const id = uuidv7();
  await db.insert(accounts).values({ id, kind, name, created_at: Date.now(), owner_user_id: ownerId });
  return id;
}

export async function addMember(accountId: string, userId: string, role: Role): Promise<void> {
  await db.insert(account_members).values({ account_id: accountId, user_id: userId, role });
}

export async function createProfile(accountId: string, updatedBy: string, name = 'Test Kid'): Promise<string> {
  const id = uuidv7();
  await db.insert(profiles).values({
    id,
    account_id: accountId,
    name,
    avatar_emoji: null,
    avatar_photo_id: null,
    share_token: null,
    first_then_activity_id: null,
    first_then_reward_id: null,
    settings: {},
    client_updated_at: Date.now(),
    updated_by: updatedBy,
    deleted_at: null,
  });
  return id;
}

export interface TestProfileSetup {
  readonly admin: TestUser;
  readonly accountId: string;
  readonly profileId: string;
}

/** Admin user + account + profile: the starting point for every sync/media test. */
export async function setupProfile(): Promise<TestProfileSetup> {
  const admin = await createUser();
  const accountId = await createAccount(admin.id);
  await addMember(accountId, admin.id, 'admin');
  const profileId = await createProfile(accountId, admin.id);
  return { admin, accountId, profileId };
}

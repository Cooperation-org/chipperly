import type { Role } from '@chipperly/shared/schemas/account';
import type { MeAccount } from '@chipperly/shared/schemas/auth';

/** A viewer reads and changes nothing; admin and member edit (a member only on their assigned people, which the server already limits). */
export function canEditRole(role: Role | undefined): boolean {
  return role !== 'viewer';
}

/** The signed-in user's role in the account that owns this profile; undefined when unknown (a local profile, a guest). */
export function roleForProfile(
  accounts: readonly MeAccount[],
  profiles: ReadonlyArray<{ id: string; account_id: string }>,
  profileId: string | null | undefined,
): Role | undefined {
  const accountId = profiles.find((p) => p.id === profileId)?.account_id;
  return accounts.find((a) => a.account.id === accountId)?.role;
}

/** Pure version for the sync layer: may this user change rows of this profile? */
export function canEditProfile(
  accounts: readonly MeAccount[],
  profiles: ReadonlyArray<{ id: string; account_id: string }>,
  profileId: string | null | undefined,
): boolean {
  return canEditRole(roleForProfile(accounts, profiles, profileId));
}

/** What the app calls each role. */
export function roleLabel(role: Role): string {
  return role === 'admin' ? 'Admin' : role === 'viewer' ? 'Viewer' : 'Support team';
}

export const VIEW_ONLY_MESSAGE = 'View only. Ask an admin to make changes.';

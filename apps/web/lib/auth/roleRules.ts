import type { Role } from '@chipperly/shared/schemas/account';
import type { MeAccount } from '@chipperly/shared/schemas/auth';

/** A viewer reads and changes nothing; admin, moderator and member edit (the server limits a moderator or member to their groups and people). */
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

/**
 * What the app calls each role. In an organization (kind 'agency'): admin is "Owner" for the account's
 * owner and "Org admin" for anyone else, moderator is "Moderator", member is "Staff", viewer is "Family".
 * Other kinds keep Admin / Support team / Viewer.
 */
export function roleLabel(role: Role, accountKind?: string, isOwner = false): string {
  if (accountKind === 'agency') {
    return role === 'admin' ? (isOwner ? 'Owner' : 'Org admin') : role === 'moderator' ? 'Moderator' : role === 'viewer' ? 'Family' : 'Staff';
  }
  return role === 'admin' ? 'Admin' : role === 'viewer' ? 'Viewer' : role === 'moderator' ? 'Moderator' : 'Support team';
}

/** One line under the role picker. */
export function roleHint(role: Role, accountKind?: string): string {
  const org = accountKind === 'agency';
  if (role === 'admin') return org ? 'Sees and edits everyone, runs billing, groups and the team' : 'Sees and edits everyone, manages the team';
  if (role === 'moderator') return 'Runs the groups you pick: people, reports, and the Staff and Family inside them';
  if (role === 'member') return org ? 'Sees and edits the groups and people you pick' : 'Sees and edits the people you choose';
  return org ? 'Can only look at the groups and people you pick' : 'Can only look at the people you choose';
}

/** The roles a person can be given. Moderator is only offered in organizations, and a moderator can only hand out Staff and Family. */
export function roleChoices(accountKind: string | undefined, callerRole: Role = 'admin'): Role[] {
  if (callerRole === 'moderator') return ['member', 'viewer'];
  return accountKind === 'agency' ? ['admin', 'moderator', 'member', 'viewer'] : ['admin', 'member', 'viewer'];
}

export interface MemberAccess {
  role: Role;
  /** Groups the person is assigned to. */
  cluster_ids?: readonly string[];
  /** People assigned to them directly. */
  profile_ids?: readonly string[];
}

/**
 * May the signed-in user change or remove this member? Mirrors the server: an admin manages anyone;
 * a moderator manages Staff and Family whose access (groups and people) is entirely inside their own,
 * and nobody who has no access yet. `scope` is the moderator's own groups and the people they see.
 */
export function canManageMember(
  caller: { role: Role | undefined },
  target: MemberAccess,
  scope: { groups: ReadonlySet<string>; profiles: ReadonlySet<string> } = { groups: new Set(), profiles: new Set() },
): boolean {
  if (caller.role === 'admin') return true;
  if (caller.role !== 'moderator') return false;
  if (target.role !== 'member' && target.role !== 'viewer') return false;
  const groups = target.cluster_ids ?? [];
  const people = target.profile_ids ?? [];
  if (groups.length + people.length === 0) return false;
  return groups.every((g) => scope.groups.has(g)) && people.every((p) => scope.profiles.has(p));
}

export const VIEW_ONLY_MESSAGE = 'View only. Ask an admin to make changes.';

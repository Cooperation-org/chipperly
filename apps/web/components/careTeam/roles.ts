import type { Role } from '@chipperly/shared/schemas/account';
import { roleChoices, roleHint, roleLabel } from '../../lib/auth/roleRules';

/** What a role is called on screen outside an organization. The DB value for "Support team" stays 'member'. Kind-aware labels: roleLabel in lib/auth/roleRules. */
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', moderator: 'Moderator', member: 'Support team', viewer: 'Viewer' };

export const ROLE_HINT: Record<Role, string> = {
  admin: roleHint('admin'),
  moderator: roleHint('moderator'),
  member: roleHint('member'),
  viewer: roleHint('viewer'),
};

export const ROLE_ITEMS = roleChoices(undefined).map((value) => ({ value, label: ROLE_LABEL[value] }));

/** The role picker items for this kind of account (Moderator only in organizations; a moderator picks Staff or Family). */
export function roleItemsFor(accountKind: string | undefined, callerRole: Role = 'admin'): { value: Role; label: string }[] {
  return roleChoices(accountKind, callerRole).map((value) => ({ value, label: roleLabel(value, accountKind) }));
}

/**
 * Support team and Viewer need at least one person, or they would see nobody. In an organization a group counts
 * too (`groupCount`), and `inOrg` words the message. Returns the error text, or undefined.
 */
export function missingPersonError(role: Role, ids: Set<string>, groupCount = 0, inOrg = false): string | undefined {
  if (role === 'admin' || ids.size + groupCount > 0) return undefined;
  return inOrg ? 'Pick at least one group or person they can see.' : 'Pick at least one person they can see.';
}

/**
 * The profile_ids to send when saving a member, or undefined to leave their list alone.
 * An admin has no profile_members rows (they see everyone implicitly), so demoting one must send the list.
 */
export function profileIdsToSave(wasRole: Role, newRole: Role, initialIds: string[], ids: Set<string>): string[] | undefined {
  if (newRole === 'admin') return undefined;
  const listChanged = ids.size !== initialIds.length || initialIds.some((id) => !ids.has(id));
  return listChanged || wasRole === 'admin' ? Array.from(ids) : undefined;
}

/**
 * The group ids to send (PUT /accounts/:id/members/:user_id/groups) when saving a member, or undefined to leave
 * their groups alone. Making someone admin clears them on the server, so nothing is sent then.
 */
export function groupIdsToSave(newRole: Role, initialIds: readonly string[], ids: Set<string>): string[] | undefined {
  if (newRole === 'admin') return undefined;
  const changed = ids.size !== initialIds.length || initialIds.some((id) => !ids.has(id));
  return changed ? Array.from(ids) : undefined;
}

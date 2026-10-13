import type { Role } from '@chipperly/shared/schemas/account';

/** What a role is called on screen. The DB value for "Support team" stays 'member'. */
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', member: 'Support team', viewer: 'Viewer' };

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Sees and edits everyone, manages the team',
  member: 'Sees and edits the people you choose',
  viewer: 'Can only look at the people you choose',
};

export const ROLE_ITEMS = (['admin', 'member', 'viewer'] as const).map((value) => ({ value, label: ROLE_LABEL[value] }));

/** Support team and Viewer need at least one person, or they would see nobody. Returns the error text, or undefined. */
export function missingPersonError(role: Role, ids: Set<string>): string | undefined {
  return role !== 'admin' && ids.size === 0 ? 'Pick at least one person they can see.' : undefined;
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

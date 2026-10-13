import type { Role } from '@chipperly/shared/schemas/account';

/** What a role is called on screen. The DB value for "Support team" stays 'member'. */
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', member: 'Support team', viewer: 'Viewer' };

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Sees and edits everyone, manages the team',
  member: 'Sees and edits the people you choose',
  viewer: 'Can only look at the people you choose',
};

export const ROLE_ITEMS = (['admin', 'member', 'viewer'] as const).map((value) => ({ value, label: ROLE_LABEL[value] }));

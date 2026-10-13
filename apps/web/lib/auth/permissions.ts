'use client';

import { useActiveProfile } from '../profile/active';
import { canEditProfile } from './roleRules';
import { useSession } from './session';

export { VIEW_ONLY_MESSAGE, canEditProfile, canEditRole, roleForProfile } from './roleRules';

/**
 * The one place the UI asks "may I change things for the child on screen?".
 * False for a viewer. Pass a profile id to ask about another child than the active one.
 * Screens use this to hide edit, add, drag and lock controls; the server refuses a viewer's writes anyway.
 */
export function useCanEdit(profileId?: string): boolean {
  const { accounts, profiles } = useSession();
  const { profile } = useActiveProfile();
  return canEditProfile(accounts, profiles, profileId ?? profile?.id);
}

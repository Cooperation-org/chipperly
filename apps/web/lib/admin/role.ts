import type { AdminRole } from '@chipperly/shared/schemas/admin';
import { useSession } from '@/lib/auth/session';

/**
 * 'super' does everything; 'support' looks things up and does the safe support
 * actions; 'moderator' only moderates; null is not an admin. Mirrors the API's
 * lib/adminRoles.ts, which is what actually decides.
 */
export function useAdminRole(): AdminRole | null {
  const { user } = useSession();
  return user?.admin_role ?? (user?.is_super_admin ? 'super' : user?.is_support ? 'support' : null);
}

/** Extend a trial, free access, a code, resend verification, reminders, beta codes, feedback status. */
export const canAct = (role: AdminRole | null): boolean => role === 'super' || role === 'support';

/** Money, editing or closing people, offers, roles, backups. */
export const canChange = (role: AdminRole | null): boolean => role === 'super';

/** Pages that read people, payments and organizations. */
export const canRead = canAct;

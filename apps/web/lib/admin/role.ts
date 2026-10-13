import type { AdminRole } from '@chipperly/shared/schemas/admin';
import { useSession } from '@/lib/auth/session';

/** 'super' changes things, 'support' (users.is_support) only looks, null is not an admin. */
export function useAdminRole(): AdminRole | null {
  const { user } = useSession();
  return user?.is_super_admin ? 'super' : user?.is_support ? 'support' : null;
}

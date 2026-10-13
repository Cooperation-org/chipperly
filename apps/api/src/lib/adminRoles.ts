import { eq } from 'drizzle-orm';
import type { AdminRole } from '@chipperly/shared/schemas/admin';
import { db } from '../db/client.js';
import { admin_team } from '../db/schema/adminTools.js';
import { isSuperAdmin } from './trial.js';

/**
 * The one place an admin role is worked out: super admins from SUPER_ADMIN_EMAILS,
 * then the admin team list (by email, so it can be set before they sign up), then the
 * older users.is_support flag, which counts as support.
 */
export async function adminRoleOf(user: { email: string; is_support: boolean }): Promise<AdminRole | null> {
  if (isSuperAdmin(user.email)) return 'super';
  const [row] = await db.select({ role: admin_team.role }).from(admin_team).where(eq(admin_team.email, user.email.toLowerCase())).limit(1);
  if (row) return row.role;
  return user.is_support ? 'support' : null;
}

/** What each role may do. `read` and `act` are the admin site; `moderate` is the community queue. */
export const ALLOWED: Record<'read' | 'act' | 'moderate', ReadonlySet<AdminRole>> = {
  read: new Set(['super', 'support']),
  act: new Set(['super', 'support']),
  moderate: new Set(['super', 'support', 'moderator']),
};

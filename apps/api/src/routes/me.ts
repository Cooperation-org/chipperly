import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import { PinBodySchema, type MeAccount, type MeResponse } from '@chipperly/shared/schemas/auth';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { hashPin } from '../lib/password.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

export default async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireUser }, async (request): Promise<MeResponse> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        pin_hash: users.pin_hash,
        email_verified_at: users.email_verified_at,
        created_at: users.created_at,
        auth_provider: users.auth_provider,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRow) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const user: UserPublic = userRow;

    const memberships = await db.select().from(account_members).where(eq(account_members.user_id, userId));
    const accountIds = memberships.map((m) => m.account_id);
    const accountRows =
      accountIds.length > 0 ? await db.select().from(accounts).where(inArray(accounts.id, accountIds)) : [];
    const roleByAccountId = new Map(memberships.map((m) => [m.account_id, m.role]));
    const meAccounts: MeAccount[] = accountRows.map((account) => ({
      account,
      role: roleByAccountId.get(account.id) ?? 'member',
    }));

    const adminAccountIds = memberships.filter((m) => m.role === 'admin').map((m) => m.account_id);
    const adminProfiles =
      adminAccountIds.length > 0
        ? await db
            .select()
            .from(profiles)
            .where(and(inArray(profiles.account_id, adminAccountIds), isNull(profiles.deleted_at)))
        : [];
    const memberProfileRows = await db
      .select({ profile: profiles })
      .from(profile_members)
      .innerJoin(profiles, eq(profile_members.profile_id, profiles.id))
      .where(and(eq(profile_members.user_id, userId), isNull(profiles.deleted_at)));

    const profileById = new Map<string, Profile>();
    for (const profile of adminProfiles) profileById.set(profile.id, profile);
    for (const { profile } of memberProfileRows) profileById.set(profile.id, profile);

    return {
      user,
      accounts: meAccounts,
      profiles: [...profileById.values()],
    };
  });

  app.patch('/me/pin', { preHandler: requireUser }, async (request): Promise<{ pin_hash: string }> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const body = PinBodySchema.parse(request.body);
    const pinHash = await hashPin(body.pin);
    await db.update(users).set({ pin_hash: pinHash }).where(eq(users.id, authUser.id));

    return { pin_hash: pinHash };
  });
}

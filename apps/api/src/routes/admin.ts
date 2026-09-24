import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ExtendTrialBodySchema,
  UpsertPromoCodeBodySchema,
  type AdminOverview,
  type AdminUser,
  type PromoCode,
} from '@chipperly/shared/schemas/billing';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import { db, sql } from '../db/client.js';
import { promo_codes, users } from '../db/schema/accounts.js';
import { isSuperAdmin, trialEndsAt } from '../lib/trial.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Only people in SUPER_ADMIN_EMAILS, and never from a device locked to a child. */
async function requireSuperAdmin(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new AppError(401, 'unauthorized', 'Sign-in required');
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, request.user.id)).limit(1);
  if (!user || !isSuperAdmin(user.email) || request.locked) throw new AppError(403, 'forbidden', 'Super admins only');
}

/** The super admin dashboard (apps/web /admin/): who signed up, trials, early access codes. */
export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireUser, requireSuperAdmin] };

  app.get('/admin/overview', guard, async (): Promise<AdminOverview> => {
    const now = Date.now();
    const rows = await db.select({ created_at: users.created_at, trial_ends_at: users.trial_ends_at, promo_code: users.promo_code }).from(users);
    const [{ active } = { active: 0 }] = await sql<{ active: number }[]>`
      select count(distinct user_id)::int as active from devices where last_seen_at > ${now - 7 * DAY_MS}`;
    const [{ children } = { children: 0 }] = await sql<{ children: number }[]>`
      select count(*)::int as children from profiles where deleted_at is null`;
    const kinds = await sql<{ kind: string; count: number }[]>`select kind, count(*)::int as count from accounts group by kind`;

    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) byDay.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), 0);
    for (const r of rows) {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      if (byDay.has(day)) byDay.set(day, byDay.get(day)! + 1);
    }
    const trialsActive = rows.filter((r) => trialEndsAt(r) > now).length;
    return {
      users: rows.length,
      signups_7d: rows.filter((r) => r.created_at > now - 7 * DAY_MS).length,
      signups_30d: rows.filter((r) => r.created_at > now - 30 * DAY_MS).length,
      active_7d: active,
      children,
      accounts_by_kind: Object.fromEntries(kinds.map((k) => [k.kind, k.count])),
      trials_active: trialsActive,
      trials_ended: rows.length - trialsActive,
      promo_claims: rows.filter((r) => r.promo_code).length,
      signups_by_day: [...byDay].map(([day, count]) => ({ day, count })),
    };
  });

  app.get('/admin/users', guard, async (request): Promise<{ users: AdminUser[] }> => {
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(request.query);
    const like = `%${(q ?? '').toLowerCase()}%`;
    // ponytail: newest 500, searched server-side; page it once there are more people than that.
    const rows = await sql<
      {
        id: string;
        email: string;
        display_name: string;
        created_at: string;
        email_verified_at: string | null;
        trial_ends_at: string | null;
        promo_code: string | null;
        account_kinds: string[] | null;
        children: number;
        devices: number;
        last_seen_at: string | null;
      }[]
    >`
      select u.id, u.email, u.display_name, u.created_at, u.email_verified_at, u.trial_ends_at, u.promo_code,
        (select array_agg(distinct a.kind) from account_members m join accounts a on a.id = m.account_id where m.user_id = u.id) as account_kinds,
        (select count(*)::int from account_members m join profiles p on p.account_id = m.account_id
           where m.user_id = u.id and m.role = 'admin' and p.deleted_at is null) as children,
        (select count(*)::int from devices d where d.user_id = u.id) as devices,
        (select max(d.last_seen_at) from devices d where d.user_id = u.id) as last_seen_at
      from users u
      where lower(u.email) like ${like} or lower(u.display_name) like ${like}
      order by u.created_at desc
      limit 500`;
    return {
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        display_name: r.display_name,
        created_at: Number(r.created_at),
        email_verified: r.email_verified_at !== null,
        trial_ends_at: trialEndsAt({ created_at: Number(r.created_at), trial_ends_at: r.trial_ends_at === null ? null : Number(r.trial_ends_at) }),
        promo_code: r.promo_code,
        account_kinds: r.account_kinds ?? [],
        children: r.children,
        devices: r.devices,
        last_seen_at: r.last_seen_at === null ? null : Number(r.last_seen_at),
      })),
    };
  });

  /** Adds days to someone's trial, counted from today if it already ended. */
  app.post('/admin/users/:id/extend-trial', guard, async (request): Promise<{ trial_ends_at: number }> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const { days } = ExtendTrialBodySchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    const trial_ends_at = Math.max(trialEndsAt(user), Date.now()) + days * DAY_MS;
    await db.update(users).set({ trial_ends_at }).where(eq(users.id, id));
    return { trial_ends_at };
  });

  app.get('/admin/promo-codes', guard, async (): Promise<{ codes: PromoCode[] }> => {
    const codes = await db.select().from(promo_codes).orderBy(promo_codes.created_at);
    const claims = await sql<{ code: string; n: number }[]>`select promo_code as code, count(*)::int as n from users where promo_code is not null group by promo_code`;
    const byCode = new Map(claims.map((c) => [c.code, c.n]));
    return { codes: codes.map((c) => ({ ...c, claims: byCode.get(c.code) ?? 0 })) };
  });

  /** Creates or edits a code (same body both ways; the code is the key). */
  app.put('/admin/promo-codes', guard, async (request): Promise<{ ok: true }> => {
    const body = UpsertPromoCodeBodySchema.parse(request.body);
    if (body.valid_until <= body.valid_from) throw new AppError(400, 'bad_dates', 'The end must be after the start');
    const { code, ...rest } = body;
    await db
      .insert(promo_codes)
      .values({ code, ...rest, created_at: Date.now() })
      .onConflictDoUpdate({ target: promo_codes.code, set: rest });
    return { ok: true };
  });
}

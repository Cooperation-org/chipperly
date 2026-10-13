import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  AdminCompBodySchema,
  AdminEditUserBodySchema,
  AdminEraseUserBodySchema,
  ExtendTrialBodySchema,
  IssueCodeBodySchema,
  UpsertPromoCodeBodySchema,
  type AdminOverview,
  type AdminPayments,
  type AdminUser,
  type PromoCode,
} from '@chipperly/shared/schemas/billing';
import { SetTeamRoleBodySchema, type AdminTeamMember } from '@chipperly/shared/schemas/admin';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import { db, sql } from '../db/client.js';
import { accounts, promo_codes, users } from '../db/schema/accounts.js';
import { admin_team } from '../db/schema/adminTools.js';
import { deactivateUser, eraseAllowedAt, eraseUser, reactivateUser, type EraseResult } from '../lib/adminUsers.js';
import { env } from '../env.js';
import { isSuperAdmin, trialEndsAt } from '../lib/trial.js';
import { issuePersonalCode } from '../lib/earlyAccess.js';
import { recordAdminAction } from '../lib/adminStripe.js';
import { checkPass } from '../lib/twoStep.js';
import { adminRoleOf, ALLOWED } from '../lib/adminRoles.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Only people in SUPER_ADMIN_EMAILS, and never from a device locked to a child. */
export async function requireSuperAdmin(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new AppError(401, 'unauthorized', 'Sign-in required');
  const [user] = await db.select({ email: users.email, totp_enabled_at: users.totp_enabled_at }).from(users).where(eq(users.id, request.user.id)).limit(1);
  if (!user || !isSuperAdmin(user.email) || request.locked) throw new AppError(403, 'forbidden', 'Super admins only');
  requireTwoStep(request, user.totp_enabled_at);
}

/**
 * Every admin route but /admin/2fa/* also needs X-Admin-Step: a pass from
 * lib/twoStep.ts, given after an authenticator code was accepted. 403, not
 * 401, so the client does not take it for an expired sign-in.
 */
function requireTwoStep(request: FastifyRequest, enabledAt: number | null): void {
  if (!env.adminTwoStep) return;
  const header = request.headers['x-admin-step'];
  if (checkPass(request.user!.id, Array.isArray(header) ? header[0] : header)) return;
  throw enabledAt === null
    ? new AppError(403, 'two_step_setup', 'Set up two-step sign-in first')
    : new AppError(403, 'two_step_required', 'Enter the code from your authenticator app');
}

/** Super admins and support (lib/adminRoles.ts): the admin site's read screens. Never from a device locked to a child. */
export async function requireAdminRead(request: FastifyRequest): Promise<void> {
  await requireAdminRole(request, ALLOWED.read);
}

/** Super admins and support: the safe support actions (trial, free access, verification, reminders, beta codes, feedback). */
export async function requireAdminAct(request: FastifyRequest): Promise<void> {
  await requireAdminRole(request, ALLOWED.act);
}

async function requireAdminRole(request: FastifyRequest, allowed: ReadonlySet<string>): Promise<void> {
  if (!request.user) throw new AppError(401, 'unauthorized', 'Sign-in required');
  const [user] = await db
    .select({ email: users.email, is_support: users.is_support, totp_enabled_at: users.totp_enabled_at })
    .from(users)
    .where(eq(users.id, request.user.id))
    .limit(1);
  const role = user ? await adminRoleOf(user) : null;
  if (!user || !role || !allowed.has(role) || request.locked) throw new AppError(403, 'forbidden', 'Admins only');
  requireTwoStep(request, user.totp_enabled_at);
}

/** The signed-in admin's email, for the audit log. */
export async function adminEmail(request: FastifyRequest): Promise<string> {
  // The route writes its own audit line, so plugins/adminAudit.ts does not add a generic one.
  request.adminAudited = true;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, request.user!.id)).limit(1);
  return user?.email ?? 'unknown';
}

/** The admin site (admin.chipperlyapp.com /admin/): who signed up, trials, early access codes. Reads are open to support, changes to super admins. */
export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireUser, requireSuperAdmin] };
  const read = { preHandler: [requireUser, requireAdminRead] };
  const act = { preHandler: [requireUser, requireAdminAct] };

  app.get('/admin/overview', read, async (): Promise<AdminOverview> => {
    const now = Date.now();
    const rows = await db.select({ created_at: users.created_at, trial_ends_at: users.trial_ends_at, personal_code: users.personal_code }).from(users);
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
      promo_claims: rows.filter((r) => r.personal_code).length,
      signups_by_day: [...byDay].map(([day, count]) => ({ day, count })),
    };
  });

  /** Payments log: subscriptions as the app holds them, and the last 200 webhook events. Read-only. */
  app.get('/admin/payments', read, async (): Promise<AdminPayments> => {
    const subs = await sql<AdminPayments['subscriptions']>`
      select s.account_id, a.name as account_name, a.kind, s.status, s.current_period_end::float8 as current_period_end,
        s.cancel_at_period_end, s.updated_at::float8 as updated_at
      from subscriptions s left join accounts a on a.id = s.account_id
      order by s.updated_at desc`;
    const events = await sql<AdminPayments['events']>`
      select e.id, e.type, e.received_at::float8 as received_at, e.result, e.status, e.detail, a.name as account_name
      from stripe_events e left join accounts a on a.id = e.account_id
      order by e.received_at desc
      limit 200`;
    return { enabled: env.stripeEnabled, subscriptions: [...subs], events: [...events] };
  });

  app.get('/admin/users', read, async (request): Promise<{ users: AdminUser[] }> => {
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
        personal_code: string | null;
        deactivated_at: string | null;
        is_support: boolean;
        team_role: 'support' | 'moderator' | null;
        accounts: AdminUser['accounts'] | null;
        account_kinds: string[] | null;
        children: number;
        devices: number;
        last_seen_at: string | null;
      }[]
    >`
      select u.id, u.email, u.display_name, u.created_at, u.email_verified_at, u.trial_ends_at, u.personal_code, u.deactivated_at, u.is_support,
        (select t.role from admin_team t where t.email = lower(u.email)) as team_role,
        (select json_agg(json_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'role', m.role, 'comp_until', a.comp_until) order by a.created_at)
           from account_members m join accounts a on a.id = m.account_id where m.user_id = u.id) as accounts,
        (select array_agg(distinct a.kind) from account_members m join accounts a on a.id = m.account_id where m.user_id = u.id) as account_kinds,
        (select count(*)::int from account_members m join profiles p on p.account_id = m.account_id
           where m.user_id = u.id and m.role = 'admin' and p.deleted_at is null) as children,
        (select count(*)::int from devices d where d.user_id = u.id) as devices,
        (select max(d.last_seen_at) from devices d where d.user_id = u.id) as last_seen_at
      from users u
      where lower(u.email) like ${like} or lower(u.display_name) like ${like}
        or exists (select 1 from account_members m join accounts a on a.id = m.account_id where m.user_id = u.id and lower(a.name) like ${like})
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
        personal_code: r.personal_code,
        deactivated_at: r.deactivated_at === null ? null : Number(r.deactivated_at),
        is_support: r.is_support,
        is_super_admin: isSuperAdmin(r.email),
        admin_role: isSuperAdmin(r.email) ? 'super' : (r.team_role ?? (r.is_support ? 'support' : null)),
        accounts: (r.accounts ?? []).map((a) => ({ ...a, comp_until: a.comp_until === null ? null : Number(a.comp_until) })),
        account_kinds: r.account_kinds ?? [],
        children: r.children,
        devices: r.devices,
        last_seen_at: r.last_seen_at === null ? null : Number(r.last_seen_at),
      })),
    };
  });

  /** The person being changed. A super admin cannot close or erase themselves or another super admin from here. */
  async function target(request: FastifyRequest, protect: boolean) {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    if (protect && (id === request.user?.id || isSuperAdmin(user.email))) throw new AppError(403, 'protected', 'A super admin cannot be closed or erased here');
    return user;
  }

  /** Name, email, and whether the email counts as verified. */
  app.patch('/admin/users/:id', guard, async (request): Promise<{ ok: true }> => {
    const user = await target(request, false);
    const body = AdminEditUserBodySchema.parse(request.body);
    if (body.email && body.email !== user.email) {
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
      if (taken) throw new AppError(409, 'email_taken', 'Another person already uses that email');
    }
    const changes: Partial<typeof users.$inferInsert> = {};
    if (body.display_name !== undefined) changes.display_name = body.display_name;
    if (body.email !== undefined) changes.email = body.email;
    // A changed email is unverified again unless the admin says otherwise in the same save.
    if (body.email_verified !== undefined) changes.email_verified_at = body.email_verified ? (user.email_verified_at ?? Date.now()) : null;
    else if (body.email !== undefined && body.email !== user.email) changes.email_verified_at = null;
    if (Object.keys(changes).length > 0) await db.update(users).set(changes).where(eq(users.id, user.id));
    return { ok: true };
  });

  /** Closes the sign-in. Nothing is removed; it can be reopened, or erased after 30 days. */
  app.post('/admin/users/:id/deactivate', guard, async (request): Promise<{ ok: true }> => {
    const user = await target(request, true);
    await deactivateUser(user.id);
    return { ok: true };
  });

  app.post('/admin/users/:id/reactivate', guard, async (request): Promise<{ ok: true }> => {
    const user = await target(request, false);
    await reactivateUser(user.id);
    return { ok: true };
  });

  /** Erases for good: only a closed sign-in, only 30 days after it was closed, and only with the email typed again. */
  app.delete('/admin/users/:id', guard, async (request): Promise<EraseResult> => {
    const user = await target(request, true);
    const { confirm_email, now } = AdminEraseUserBodySchema.parse(request.body);
    if (confirm_email !== user.email) throw new AppError(400, 'confirm_mismatch', 'The email does not match');
    if (!now) {
      if (user.deactivated_at === null) throw new AppError(409, 'not_closed', 'Close the sign-in first');
      if (Date.now() < eraseAllowedAt(user.deactivated_at)) throw new AppError(409, 'too_soon', 'This person can be erased 30 days after their sign-in was closed');
    }
    const result = await eraseUser(user.id);
    request.log.warn({ erased_user: user.id, by: request.user?.id, ...result }, 'user erased');
    await recordAdminAction(
      await adminEmail(request),
      now ? 'erased_now' : 'erased',
      user.email,
      `${result.accounts_removed.length} account(s) removed, ${result.accounts_left.length} kept for others, ${result.rows_removed} rows, ${result.files_removed} files`,
    );
    return result;
  });

  /** Free access for one account until a date, or `until: null` to take it away. */
  app.put('/admin/accounts/:id/comp', act, async (request): Promise<{ ok: true }> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const { until, note } = AdminCompBodySchema.parse(request.body);
    const updated = await db.update(accounts).set({ comp_until: until, comp_note: until === null ? null : note }).where(eq(accounts.id, id)).returning({ id: accounts.id });
    if (updated.length === 0) throw new AppError(404, 'not_found', 'Account not found');
    return { ok: true };
  });

  /** Gives someone their own early access code under an offer (e.g. a person who signed up before or after its dates). */
  app.post('/admin/users/:id/issue-code', act, async (request): Promise<{ code: string }> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const { offer } = IssueCodeBodySchema.parse(request.body);
    const [user] = await db.select({ personal_code: users.personal_code }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    if (user.personal_code) throw new AppError(409, 'has_code', 'They already have a code');
    const [known] = await db.select({ code: promo_codes.code }).from(promo_codes).where(eq(promo_codes.code, offer)).limit(1);
    if (!known) throw new AppError(404, 'not_found', 'Offer not found');
    return { code: await issuePersonalCode(id, known.code) };
  });

  /** Adds days to someone's trial, counted from today if it already ended. */
  app.post('/admin/users/:id/extend-trial', act, async (request): Promise<{ trial_ends_at: number }> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const { days } = ExtendTrialBodySchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    const trial_ends_at = Math.max(trialEndsAt(user), Date.now()) + days * DAY_MS;
    await db.update(users).set({ trial_ends_at }).where(eq(users.id, id));
    return { trial_ends_at };
  });

  /** The admin team: super admins (read-only here) and everyone given support or moderator by email. */
  app.get('/admin/team', read, async (): Promise<{ team: AdminTeamMember[] }> => {
    const rows = await db.select().from(admin_team).orderBy(admin_team.added_at);
    const emails = [...env.superAdminEmails, ...rows.map((r) => r.email)];
    const known = emails.length ? await db.select({ email: users.email }).from(users).where(inArray(users.email, emails)) : [];
    const has = new Set(known.map((k) => k.email));
    return {
      team: [
        ...[...env.superAdminEmails].map((email) => ({ email, role: 'super' as const, editable: false, has_account: has.has(email), added_by: null, added_at: null })),
        ...rows
          .filter((r) => !env.superAdminEmails.has(r.email))
          .map((r) => ({ email: r.email, role: r.role, editable: true, has_account: has.has(r.email), added_by: r.added_by, added_at: r.added_at })),
      ],
    };
  });

  /** Give or change a role by email. Works before they have an account: it applies when they sign up. */
  app.put('/admin/team', guard, async (request): Promise<{ ok: true }> => {
    const { email, role } = SetTeamRoleBodySchema.parse(request.body ?? {});
    if (env.superAdminEmails.has(email)) throw new AppError(409, 'super_admin', 'This is a super admin; that comes from the server settings');
    const by = await adminEmail(request);
    await db
      .insert(admin_team)
      .values({ email, role, added_by: by, added_at: Date.now() })
      .onConflictDoUpdate({ target: admin_team.email, set: { role, added_by: by } });
    await recordAdminAction(by, `team_${role}`, email);
    return { ok: true };
  });

  app.delete('/admin/team/:email', guard, async (request): Promise<{ ok: true }> => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(request.params);
    await db.delete(admin_team).where(eq(admin_team.email, email));
    // The older flag would otherwise keep them in as support.
    await db.update(users).set({ is_support: false }).where(eq(users.email, email));
    await recordAdminAction(await adminEmail(request), 'team_removed', email);
    return { ok: true };
  });

  app.get('/admin/promo-codes', read, async (): Promise<{ codes: PromoCode[] }> => {
    const codes = await db.select().from(promo_codes).orderBy(promo_codes.created_at);
    const issued = await sql<{ code: string; n: number }[]>`
      select promo_code as code, count(*)::int as n from users where personal_code is not null group by promo_code`;
    const byCode = new Map(issued.map((c) => [c.code, c.n]));
    return { codes: codes.map((c) => ({ ...c, issued: byCode.get(c.code) ?? 0 })) };
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

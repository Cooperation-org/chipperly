import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, sql as dsql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CreateOrgBodySchema,
  SendBetaCodeBodySchema,
  TwoStepCodeBodySchema,
  type AdminClientErrorGroup,
  type AdminEmail,
  type AdminFailedPayment,
  type AdminInsights,
  type AdminWaitlistEntry,
  type TwoStepPass,
  type TwoStepSetup,
  type TwoStepStatus,
} from '@chipperly/shared/schemas/admin';
import { TRIAL_DAYS } from '@chipperly/shared/schemas/billing';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import { db, sql } from '../db/client.js';
import { account_members, users } from '../db/schema/accounts.js';
import { client_errors, email_log } from '../db/schema/adminTools.js';
import { admin_actions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { createOrgBilling, listSubscriptions, recordAdminAction } from '../lib/adminStripe.js';
import { renderEmail, siteOrigin } from '../lib/emailTemplate.js';
import { sendMail } from '../lib/mailer.js';
import { createOrgWithOwnerInvite } from '../lib/orgOwner.js';
import { stripeRequest } from '../lib/stripe.js';
import { adminRoleOf } from '../lib/adminRoles.js';
import {
  checkTotp,
  hashRecovery,
  issuePass,
  newRecoveryCodes,
  newSecret,
  openSecret,
  otpauthUrl,
  base32Encode,
  sealSecret,
} from '../lib/twoStep.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { adminEmail, requireAdminAct, requireAdminRead, requireSuperAdmin } from './admin.js';
import { sendVerificationEmail } from './auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE = ['active', 'trialing', 'past_due'];

/** The admin site's extra tools: two-step sign-in, growth, failed payments, waitlist, email log, app errors, new orgs. */
export default async function adminToolRoutes(app: FastifyInstance): Promise<void> {
  const read = { preHandler: [requireUser, requireAdminRead] };
  const write = { preHandler: [requireUser, requireSuperAdmin] };
  const act = { preHandler: [requireUser, requireAdminAct] };

  // ---- two-step sign-in (no pass needed for these, only an admin password session) ----

  async function adminSelf(request: FastifyRequest) {
    if (!request.user) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const [user] = await db.select().from(users).where(eq(users.id, request.user.id)).limit(1);
    if (!user || !(await adminRoleOf(user)) || request.locked) throw new AppError(403, 'forbidden', 'Admins only');
    return user;
  }
  // 10 code tries per 5 minutes per signed-in session (not per address: a whole office shares one).
  const twoStepLimit = {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes', keyGenerator: (r: FastifyRequest) => String(r.headers.authorization ?? r.ip) } },
    preHandler: requireUser,
  };

  app.get('/admin/2fa/status', { preHandler: requireUser }, async (request): Promise<TwoStepStatus> => {
    const user = await adminSelf(request);
    return { required: env.adminTwoStep, enrolled: user.totp_enabled_at !== null };
  });

  /** The secret to scan: made once, kept unconfirmed until /confirm accepts a code from it. Refused once set up. */
  app.post('/admin/2fa/setup', { preHandler: requireUser }, async (request): Promise<TwoStepSetup> => {
    const user = await adminSelf(request);
    if (user.totp_enabled_at !== null) throw new AppError(409, 'already_set_up', 'Two-step sign-in is already set up. Ask a super admin to reset it.');
    // The same secret until a code from it is confirmed: a reload (or a second render) must not
    // swap the QR code someone has already scanned.
    let secret: Buffer;
    try {
      secret = user.totp_secret ? openSecret(user.totp_secret) : newSecret();
    } catch {
      secret = newSecret();
    }
    if (!user.totp_secret) await db.update(users).set({ totp_secret: sealSecret(secret) }).where(eq(users.id, user.id));
    return { secret: base32Encode(secret), otpauth_url: otpauthUrl(secret, user.email) };
  });

  app.post('/admin/2fa/confirm', twoStepLimit, async (request): Promise<TwoStepPass> => {
    const user = await adminSelf(request);
    const { code } = TwoStepCodeBodySchema.parse(request.body ?? {});
    if (user.totp_enabled_at !== null) throw new AppError(409, 'already_set_up', 'Two-step sign-in is already set up');
    if (!user.totp_secret || !checkTotp(openSecret(user.totp_secret), code)) throw new AppError(400, 'wrong_code', 'That code did not match. Check the time on your phone and try the newest code.');
    const recovery = newRecoveryCodes();
    await db.update(users).set({ totp_enabled_at: Date.now(), totp_recovery: recovery.map(hashRecovery) }).where(eq(users.id, user.id));
    await recordAdminAction(user.email, 'two_step_on', user.email);
    return { ...issuePass(user.id), recovery_codes: recovery };
  });

  /** A code from the app, or one unused recovery code (which is then used up). */
  app.post('/admin/2fa/verify', twoStepLimit, async (request): Promise<TwoStepPass> => {
    const user = await adminSelf(request);
    const { code } = TwoStepCodeBodySchema.parse(request.body ?? {});
    if (user.totp_enabled_at === null || !user.totp_secret) throw new AppError(409, 'two_step_setup', 'Set up two-step sign-in first');
    if (checkTotp(openSecret(user.totp_secret), code)) return issuePass(user.id);
    const left = user.totp_recovery ?? [];
    const hash = hashRecovery(code);
    if (left.includes(hash)) {
      await db.update(users).set({ totp_recovery: left.filter((h) => h !== hash) }).where(eq(users.id, user.id));
      await recordAdminAction(user.email, 'recovery_code_used', user.email, `${left.length - 1} left`);
      return issuePass(user.id);
    }
    throw new AppError(400, 'wrong_code', 'That code did not match. Use the newest code from your app, or a recovery code.');
  });

  /** A super admin clears someone's two-step sign-in (lost phone); they set it up again at their next sign-in. */
  app.delete('/admin/users/:id/2fa', write, async (request) => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const [user] = await db.update(users).set({ totp_secret: null, totp_enabled_at: null, totp_recovery: null }).where(eq(users.id, id)).returning({ email: users.email });
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    await recordAdminAction(await adminEmail(request), 'two_step_reset', user.email);
    return { ok: true };
  });

  // ---- growth ----

  app.get('/admin/insights', read, async (): Promise<AdminInsights> => {
    const now = Date.now();
    const team = sql.array([...env.superAdminEmails, '']);
    const live = sql.array(LIVE);
    const trialDays = TRIAL_DAYS * DAY_MS;
    const soon = now + 7 * DAY_MS;
    // Not the team, not closed, and no account of theirs already paying or given free access.
    const ending = await sql<{
      user_id: string; email: string; display_name: string; trial_ends_at: string; last_seen_at: string | null; profiles: number;
      accounts: Array<{ id: string; name: string; kind: string }> | null;
    }[]>`
      select * from (
        select u.id as user_id, u.email, u.display_name, coalesce(u.trial_ends_at, u.created_at + ${trialDays}) as trial_ends_at,
          (select max(d.last_seen_at) from devices d where d.user_id = u.id) as last_seen_at,
          (select count(*)::int from account_members m join profiles p on p.account_id = m.account_id
             where m.user_id = u.id and p.deleted_at is null) as profiles,
          (select json_agg(json_build_object('id', a.id, 'name', a.name, 'kind', a.kind))
             from account_members m join accounts a on a.id = m.account_id where m.user_id = u.id) as accounts
        from users u
        where u.deactivated_at is null and not u.is_support and not (lower(u.email) = any(${team}::text[]))
          and not exists (select 1 from account_members m join accounts a on a.id = m.account_id
            left join subscriptions s on s.account_id = a.id
            where m.user_id = u.id and (s.status = any(${live}::text[]) or a.comp_until > ${now}))
      ) t
      where t.trial_ends_at > ${now} and t.trial_ends_at <= ${soon}
      order by t.trial_ends_at asc
      limit 200`;
    const [counts] = await sql<{ trials_ended: number; paying: number; active: number; comp: number }[]>`
      select
        (select count(*)::int from users u where u.deactivated_at is null and not u.is_support and not (lower(u.email) = any(${team}::text[]))
           and coalesce(u.trial_ends_at, u.created_at + ${trialDays}) <= ${now}) as trials_ended,
        (select count(*)::int from subscriptions where status not in ('incomplete', 'incomplete_expired')) as paying,
        (select count(*)::int from subscriptions where status = any(${live}::text[])) as active,
        (select count(*)::int from accounts where comp_until > ${now}) as comp`;
    return {
      trials_ending: [...ending].map((r) => ({
        user_id: r.user_id,
        email: r.email,
        display_name: r.display_name,
        trial_ends_at: Number(r.trial_ends_at),
        last_seen_at: r.last_seen_at === null ? null : Number(r.last_seen_at),
        profiles: r.profiles,
        accounts: r.accounts ?? [],
      })),
      trials_ended: counts?.trials_ended ?? 0,
      paying_accounts: counts?.paying ?? 0,
      active_subscriptions: counts?.active ?? 0,
      comp_accounts: counts?.comp ?? 0,
    };
  });

  // ---- failed payments ----

  const OpenInvoices = z.object({
    data: z.array(
      z.object({
        id: z.string(),
        amount_due: z.number().int(),
        currency: z.string(),
        due_date: z.number().int().nullish(),
        hosted_invoice_url: z.string().nullish(),
        customer_email: z.string().nullish(),
        customer: z.union([z.string(), z.object({ id: z.string() }).passthrough()]).nullish(),
        status: z.string(),
      }).passthrough(),
    ),
  });

  app.get('/admin/failed-payments', read, async (): Promise<{ enabled: boolean; items: AdminFailedPayment[] }> => {
    if (!env.stripeEnabled) return { enabled: false, items: [] };
    const now = Date.now();
    const subs = (await listSubscriptions()).filter((s) => s.status === 'past_due' || s.status === 'unpaid');
    const invoices = (await stripeRequest('GET', '/invoices', OpenInvoices, { status: 'open', collection_method: 'send_invoice', limit: '100' })).data.filter(
      (i) => i.due_date != null && i.due_date * 1000 < now,
    );
    const customers = invoices.map((i) => (typeof i.customer === 'string' ? i.customer : i.customer?.id)).filter((c): c is string => Boolean(c));
    const owners = customers.length
      ? await sql<{ customer: string; account_id: string; name: string | null }[]>`
          select s.stripe_customer_id as customer, s.account_id, a.name from subscriptions s left join accounts a on a.id = s.account_id
          where s.stripe_customer_id = any(${sql.array(customers)}::text[])`
      : [];
    const byCustomer = new Map(owners.map((o) => [o.customer, o]));
    const items: AdminFailedPayment[] = [
      ...subs.map((s) => ({
        kind: 'subscription' as const,
        id: s.id,
        account_id: s.account_id,
        account_name: s.account_name,
        customer_email: s.customer_email,
        amount: s.amount,
        currency: s.currency,
        status: s.status,
        since: s.current_period_end,
        pay_url: null,
        reminded_at: null as number | null,
      })),
      ...invoices.map((i) => {
        const owner = byCustomer.get(typeof i.customer === 'string' ? i.customer : (i.customer?.id ?? ''));
        return {
          kind: 'invoice' as const,
          id: i.id,
          account_id: owner?.account_id ?? null,
          account_name: owner?.name ?? null,
          customer_email: i.customer_email ?? null,
          amount: i.amount_due,
          currency: i.currency,
          status: 'overdue',
          since: i.due_date ? i.due_date * 1000 : null,
          pay_url: i.hosted_invoice_url ?? null,
          reminded_at: null as number | null,
        };
      }),
    ];
    const ids = items.map((i) => i.id);
    if (ids.length) {
      const sent = await db
        .select({ target: admin_actions.target, at: dsql<number>`max(${admin_actions.at})` })
        .from(admin_actions)
        .where(and(eq(admin_actions.action, 'payment_reminder'), inArray(admin_actions.target, ids)))
        .groupBy(admin_actions.target);
      const last = new Map(sent.map((s) => [s.target, Number(s.at)]));
      for (const item of items) item.reminded_at = last.get(item.id) ?? null;
    }
    return { enabled: true, items };
  });

  /** Emails the account's admins (or the invoice's address): pay the invoice, or update the card in Plan. */
  app.post('/admin/failed-payments/remind', act, async (request) => {
    const body = z.object({ kind: z.enum(['subscription', 'invoice']), id: z.string().min(3), account_id: uuidSchema.nullable(), pay_url: z.string().url().nullable(), email: z.string().email().nullable() }).parse(request.body ?? {});
    const to = new Set<string>();
    if (body.account_id) {
      const admins = await db
        .select({ email: users.email })
        .from(account_members)
        .innerJoin(users, eq(users.id, account_members.user_id))
        .where(and(eq(account_members.account_id, body.account_id), eq(account_members.role, 'admin')));
      for (const a of admins) to.add(a.email);
    }
    if (to.size === 0 && body.email) to.add(body.email);
    if (to.size === 0) throw new AppError(409, 'no_recipient', 'Nobody to send it to: this payment has no account or email we know');
    const mail =
      body.kind === 'invoice' && body.pay_url
        ? renderEmail({
            heading: 'Your Chipperly invoice is past due',
            paragraphs: ['The invoice for your Chipperly plan is past its due date. You can pay it by card or bank transfer from the link below.', 'If you have already paid, thank you, and you can ignore this email.'],
            action: { label: 'Pay the invoice', url: body.pay_url },
          })
        : renderEmail({
            heading: "Your Chipperly payment didn't go through",
            paragraphs: ['We could not take the last payment for your Chipperly plan. Everything still works for now.', 'Open Plan in Chipperly and update your card to keep it going.'],
            action: { label: 'Update your card', url: `${siteOrigin()}/settings/billing/` },
          });
    const subject = body.kind === 'invoice' ? 'Your Chipperly invoice is past due' : "Your Chipperly payment didn't go through";
    for (const email of to) await sendMail({ to: email, subject, ...mail });
    await recordAdminAction(await adminEmail(request), 'payment_reminder', body.id, [...to].join(', '));
    return { sent_to: [...to] };
  });

  // ---- waitlist (on the marketing site) ----

  async function site<T>(method: 'GET' | 'POST', path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    if (!env.CRON_SECRET) throw new AppError(409, 'site_unlinked', "The website isn't connected to the admin site yet, so the waitlist can't be read. It needs the same secret on both (see the deploy notes).");
    const res = await fetch(`${env.SITE_ORIGIN}${path}`, {
      method,
      headers: { 'x-cron-secret': env.CRON_SECRET, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new AppError(502, 'site_error', `The website answered ${res.status}`);
    return schema.parse(await res.json());
  }
  const SiteWaitlist = z.object({
    entries: z.array(z.object({ email: z.string(), name: z.string().nullish(), role: z.string().nullish(), source: z.string().nullish(), created_at: z.number(), invited_at: z.number().nullish() })),
  });

  app.get('/admin/waitlist', read, async (): Promise<{ entries: AdminWaitlistEntry[]; code_required: boolean }> => {
    const { entries } = await site('GET', '/internal/waitlist', SiteWaitlist);
    const emails = entries.map((e) => e.email.toLowerCase());
    const known = emails.length ? await db.select({ email: users.email }).from(users).where(inArray(users.email, emails)) : [];
    const has = new Set(known.map((k) => k.email));
    return {
      code_required: Boolean(env.BETA_INVITE_CODE),
      entries: entries.map((e) => ({
        email: e.email,
        name: e.name ?? null,
        role: e.role ?? null,
        source: e.source ?? null,
        created_at: e.created_at,
        invited_at: e.invited_at ?? null,
        has_account: has.has(e.email.toLowerCase()),
      })),
    };
  });

  /** Emails each address the beta code with a sign-up link that fills it in, then marks them invited on the website. */
  app.post('/admin/waitlist/send-code', act, async (request) => {
    const { emails } = SendBetaCodeBodySchema.parse(request.body ?? {});
    const code = env.BETA_INVITE_CODE;
    const sent: string[] = [];
    for (const email of emails) {
      const link = `${siteOrigin()}/sign-up/?email=${encodeURIComponent(email)}${code ? `&code=${encodeURIComponent(code)}` : ''}`;
      const mail = renderEmail({
        heading: 'Your Chipperly beta invite',
        paragraphs: [
          'Thank you for joining the Chipperly waitlist. Your spot in the beta is ready.',
          ...(code ? [`Your beta code is ${code}. The link below fills it in for you.`] : []),
          'Create your account, try everything, and tell us what is confusing or broken. It helps us more than anything.',
        ],
        action: { label: 'Create my account', url: link },
      });
      if (await sendMail({ to: email, subject: 'Your Chipperly beta invite', ...mail })) sent.push(email);
    }
    if (sent.length) await site('POST', '/internal/waitlist/invited', z.object({ ok: z.boolean() }), { emails: sent });
    await recordAdminAction(await adminEmail(request), 'beta_code_sent', `${sent.length} of ${emails.length}`, sent.join(', '));
    return { sent, failed: emails.filter((e) => !sent.includes(e)) };
  });

  // ---- one person's emails ----

  const ResendEmail = z.object({ last_event: z.string().nullish() }).passthrough();

  app.get('/admin/users/:id/emails', read, async (request): Promise<{ emails: AdminEmail[] }> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    const rows = await db.select().from(email_log).where(eq(email_log.to_email, user.email.toLowerCase())).orderBy(desc(email_log.at)).limit(30);
    // ponytail: one Resend read per email, newest 10 only; a webhook store once people open this often.
    const emails = await Promise.all(
      rows.map(async (r, i): Promise<AdminEmail> => {
        let last: string | null = null;
        if (i < 10 && r.provider_id && env.RESEND_API_KEY) {
          try {
            const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(r.provider_id)}`, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(8000) });
            if (res.ok) last = ResendEmail.parse(await res.json()).last_event ?? null;
          } catch {
            // Status unknown; the row still shows what we sent.
          }
        }
        return { id: r.id, at: r.at, subject: r.subject, result: r.result, last_event: last };
      }),
    );
    return { emails };
  });

  app.post('/admin/users/:id/resend-verification', act, async (request) => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const [user] = await db.select({ email: users.email, verified: users.email_verified_at }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    if (user.verified !== null) throw new AppError(409, 'already_verified', 'This email is already verified');
    const ok = await sendVerificationEmail(id, user.email, request);
    if (!ok) throw new AppError(502, 'mail_refused', 'The mail provider refused it. Check the address.');
    await recordAdminAction(await adminEmail(request), 'verification_resent', user.email);
    return { ok: true };
  });

  // ---- app error reports ----

  app.get('/admin/client-errors', read, async (): Promise<{ groups: AdminClientErrorGroup[]; total: number }> => {
    const since = Date.now() - 30 * DAY_MS;
    const groups = await sql<{ message: string; count: number; first_at: string; last_at: string; paths: string[]; commits: (string | null)[]; stack: string | null; user_agent: string | null }[]>`
      select message, count(*)::int as count, min(at) as first_at, max(at) as last_at,
        (array_agg(distinct path))[1:5] as paths, (array_agg(distinct commit))[1:5] as commits,
        (array_agg(stack order by at desc))[1] as stack, (array_agg(user_agent order by at desc))[1] as user_agent
      from client_errors where at > ${since}
      group by message order by max(at) desc limit 100`;
    return {
      total: groups.reduce((n, g) => n + g.count, 0),
      groups: groups.map((g) => ({ ...g, first_at: Number(g.first_at), last_at: Number(g.last_at), commits: g.commits.filter((c): c is string => Boolean(c)) })),
    };
  });

  // ---- an organization made for a customer ----

  app.post('/admin/orgs', write, async (request) => {
    const body = CreateOrgBodySchema.parse(request.body ?? {});
    const by = await adminEmail(request);
    const { accountId, inviteUrl } = await createOrgWithOwnerInvite({ name: body.name, ownerEmail: body.owner_email, ownerName: body.owner_name, createdBy: request.user!.id });
    const mail = renderEmail({
      heading: `${body.name} is ready on Chipperly`,
      paragraphs: [
        `Hi ${body.owner_name}, we have set up ${body.name} on Chipperly with you as its owner.`,
        'Accept the invite to sign in or create your login. From there you can add your staff and the people you support.',
      ],
      action: { label: 'Accept the invite', url: inviteUrl },
    });
    await sendMail({ to: body.owner_email, subject: `${body.name} is ready on Chipperly`, ...mail });
    await recordAdminAction(by, 'org_created', accountId, `${body.name}, owner invite to ${body.owner_email}`);
    const billing = body.billing && env.stripeEnabled ? await createOrgBilling(accountId, body.billing, by, siteOrigin()) : null;
    return { account_id: accountId, invite_url: inviteUrl, billing };
  });
}

/** Stores one browser error report and drops reports older than 30 days. Never throws. */
export async function storeClientError(r: { message: string; stack?: string; path: string; commit?: string; user_agent?: string }): Promise<void> {
  try {
    const now = Date.now();
    const { v7 } = await import('uuid');
    await db.insert(client_errors).values({ id: v7(), at: now, message: r.message, stack: r.stack ?? null, path: r.path, commit: r.commit ?? null, user_agent: r.user_agent?.slice(0, 300) ?? null });
    await db.delete(client_errors).where(dsql`${client_errors.at} < ${now - 30 * DAY_MS}`);
  } catch (err) {
    console.error('client error report not stored', err);
  }
}

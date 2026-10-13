import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, users } from '../db/schema/accounts.js';
import { recordAdminAction } from '../lib/adminStripe.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by routes/admin.ts adminEmail(): the route writes its own, more specific, audit line. */
    adminAudited: boolean;
  }
}

/** The route pattern without the /api base, e.g. "/admin/users/:id". */
const routeOf = (url: string | undefined) => (url ?? '').replace(/^.*?\/api(?=\/)/, '');

type Named = { action: string; target: 'user' | 'account' | 'raw'; detail?: (body: Record<string, unknown>, params: Record<string, string>) => string };

/** Plain names for the admin changes that do not write their own audit line. */
const NAMES: Record<string, Named> = {
  'PATCH /admin/users/:id': { action: 'person_edited', target: 'user', detail: (b) => `changed: ${Object.keys(b).join(', ')}` },
  'POST /admin/users/:id/deactivate': { action: 'signin_closed', target: 'user' },
  'POST /admin/users/:id/reactivate': { action: 'signin_reopened', target: 'user' },
  'PUT /admin/accounts/:id/comp': { action: 'free_access', target: 'account', detail: (b) => (b.until ? `until ${new Date(Number(b.until)).toISOString().slice(0, 10)}` : 'removed') },
  'POST /admin/users/:id/issue-code': { action: 'code_given', target: 'user', detail: (b) => String(b.offer ?? '') },
  'POST /admin/users/:id/extend-trial': { action: 'trial_extended', target: 'user', detail: (b) => `${String(b.days ?? '')} days` },
  'PUT /admin/promo-codes': { action: 'offer_saved', target: 'raw', detail: (b) => String(b.code ?? '') },
  'POST /admin/backups/:date/accounts/:accountId/restore': { action: 'backup_restored_account', target: 'raw', detail: (_b, p) => `backup of ${p.date ?? ''}, account ${p.accountId ?? ''}` },
  'POST /admin/backups/:date/restore-all': { action: 'backup_restored_all', target: 'raw', detail: (_b, p) => `backup of ${p.date ?? ''}` },
  'POST /admin/sync-rejections/:id/replay': { action: 'sync_replayed', target: 'raw' },
  'POST /admin/sync-rejections/:id/dismiss': { action: 'sync_dismissed', target: 'raw' },
  'PATCH /admin/feedback/:id': { action: 'feedback_status', target: 'raw', detail: (b) => String(b.status ?? '') },
};

async function targetName(kind: Named['target'], params: Record<string, string>): Promise<string> {
  const id = params.id ?? params.accountId ?? '';
  if (kind === 'user' && id) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    return u?.email ?? id;
  }
  if (kind === 'account' && id) {
    const [a] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, id)).limit(1);
    return a ? `${a.name} (${id})` : id;
  }
  return id || '-';
}

/**
 * Every successful admin change lands in the audit log under the admin who made it: routes that
 * log their own line are left alone, the rest get a plain-named line here. Nothing an admin
 * changes goes unrecorded.
 */
export function registerAdminAudit(app: FastifyInstance): void {
  app.decorateRequest('adminAudited', false);
  // onSend, not onResponse: the line is written before the reply leaves, so whoever acts next sees it.
  app.addHook('onSend', async (request: FastifyRequest, reply, payload) => {
    if (request.adminAudited || !request.user || reply.statusCode >= 400) return payload;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return payload;
    const route = routeOf(request.routeOptions.url);
    if (!route.startsWith('/admin/') || route.startsWith('/admin/2fa/')) return payload;
    try {
      const [admin] = await db.select({ email: users.email }).from(users).where(eq(users.id, request.user.id)).limit(1);
      const named = NAMES[`${request.method} ${route}`];
      const params = (request.params ?? {}) as Record<string, string>;
      const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
      await recordAdminAction(
        admin?.email ?? request.user.id,
        named?.action ?? `${request.method} ${route}`,
        await targetName(named?.target ?? 'raw', params),
        named?.detail?.(body, params) ?? '',
      );
    } catch (err) {
      request.log.error({ err }, 'could not write the admin audit line');
    }
    return payload;
  });
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { media } from '../src/db/schema/media.js';
import { admin_actions } from '../src/db/schema/subscriptions.js';
import { issueTokens } from '../src/lib/tokens.js';
import { env } from '../src/env.js';
import { eraseUser } from '../src/lib/adminUsers.js';

async function createUser(label: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const id = uuidv7();
  const email = `${label}-${id}@example.com`;
  await db.insert(users).values({ id, email, display_name: label, created_at: Date.now(), ...extra });
  return { id, email, token: (await issueTokens(id)).access_token };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function accountWithPhoto(ownerId: string, storageKey: string) {
  const accountId = uuidv7();
  await db.insert(accounts).values({ id: accountId, kind: 'household', name: 'Photo home', created_at: Date.now(), owner_user_id: ownerId });
  await db.insert(account_members).values({ account_id: accountId, user_id: ownerId, role: 'admin' });
  await db.insert(media).values({
    id: uuidv7(), account_id: accountId, kind: 'image', status: 'ready', storage_key: storageKey, content_type: 'image/webp',
    bytes: 10, original_bytes: 10, created_by: ownerId, created_at: Date.now(),
  });
  return accountId;
}

describe('admin erase and audit', () => {
  let app: FastifyInstance;
  let boss: Awaited<ReturnType<typeof createUser>>;
  beforeAll(async () => {
    app = await buildTestApp();
    boss = await createUser('actboss');
    env.superAdminEmails.add(boss.email);
  });
  afterAll(async () => {
    await app.close();
  });

  it('every admin change is logged under the admin, even routes that do not write their own line', async () => {
    const person = await createUser('trialist');
    expect((await request(app, { method: 'POST', url: `/api/admin/users/${person.id}/extend-trial`, headers: auth(boss.token), payload: { days: 7 } })).statusCode).toBe(200);
    const [line] = await db.select().from(admin_actions).where(and(eq(admin_actions.target, person.email), eq(admin_actions.action, 'trial_extended')));
    expect(line).toMatchObject({ admin_email: boss.email, detail: '7 days' });
    const mine = (await request(app, { method: 'GET', url: `/api/admin/actions?admin=${encodeURIComponent(boss.email)}`, headers: auth(boss.token) })).json() as { actions: Array<{ admin_email: string }>; admins: string[] };
    expect(mine.actions.length).toBeGreaterThan(0);
    expect(mine.actions.every((a) => a.admin_email === boss.email)).toBe(true);
    expect(mine.admins).toContain(boss.email);
  });

  it('erase now: no 30-day wait, and a stored photo is deleted only when nobody else uses it', async () => {
    const shared = `photos/${uuidv7()}.webp`;
    const a = await createUser('erasea');
    const b = await createUser('eraseb');
    await accountWithPhoto(a.id, shared);
    await accountWithPhoto(b.id, shared); // like a family handover: same stored file in another account
    const deleted: string[] = [];
    const storage = { delete: async (k: string) => void deleted.push(k) };
    expect((await eraseUser(a.id, storage)).files_removed).toBe(0);
    expect(deleted).toEqual([]);
    expect((await eraseUser(b.id, storage)).files_removed).toBe(1);
    expect(deleted).toEqual([shared]);

    // Through the admin site: typed email, now, logged.
    const c = await createUser('erasec');
    const res = await request(app, { method: 'DELETE', url: `/api/admin/users/${c.id}`, headers: auth(boss.token), payload: { confirm_email: c.email, now: true } });
    expect(res.statusCode, res.body).toBe(200);
    expect((await db.select().from(users).where(eq(users.id, c.id))).length).toBe(0);
    const [line] = await db.select().from(admin_actions).where(eq(admin_actions.target, c.email));
    expect(line?.action).toBe('erased_now');
  });
});

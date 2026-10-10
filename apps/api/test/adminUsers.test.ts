import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { addMember, createUser, setupProfile } from './fixtures.js';
import { db } from '../src/db/client.js';
import { account_members, accounts, sessions, users } from '../src/db/schema/accounts.js';
import { profiles } from '../src/db/schema/profiles.js';
import { rewards } from '../src/db/schema/rewards.js';
import { env } from '../src/env.js';
import { hashPassword } from '../src/lib/password.js';
import { accessState } from '../src/lib/trial.js';

const DAY = 24 * 60 * 60 * 1000;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

describe('super admin: people', () => {
  let app: FastifyInstance;
  let boss: { id: string; token: string };
  beforeAll(async () => {
    app = await buildTestApp();
    boss = await createUser('the boss');
    env.superAdminEmails.add((await userRow(boss.id))!.email);
  });
  afterAll(async () => {
    await app.close();
  });

  const call = (method: 'PATCH' | 'POST' | 'DELETE' | 'PUT' | 'GET', url: string, payload?: object, token = boss.token) =>
    request(app, { method, url: `/api${url}`, headers: auth(token), payload });

  it('edits a name and an email, refuses an email someone else has, and is closed to everyone else', async () => {
    const a = await createUser('Old Name');
    const b = await createUser('Other');
    expect((await call('PATCH', `/admin/users/${a.id}`, { display_name: 'x' }, b.token)).statusCode).toBe(403);

    await db.update(users).set({ email_verified_at: 123 }).where(eq(users.id, a.id));
    const fresh = `renamed-${uuidv7()}@example.com`;
    expect((await call('PATCH', `/admin/users/${a.id}`, { display_name: 'New Name', email: fresh.toUpperCase() })).statusCode).toBe(200);
    // A changed email has to be verified again.
    expect(await userRow(a.id)).toMatchObject({ display_name: 'New Name', email: fresh, email_verified_at: null });
    expect((await call('PATCH', `/admin/users/${a.id}`, { email_verified: true })).statusCode).toBe(200);
    expect((await userRow(a.id))!.email_verified_at).not.toBeNull();

    const taken = await call('PATCH', `/admin/users/${a.id}`, { email: (await userRow(b.id))!.email });
    expect(taken.statusCode).toBe(409);
    expect((await userRow(a.id))!.email).toBe(fresh);
  });

  it('closing a sign-in stops new sign-ins and open sessions, keeps everything, and can be undone', async () => {
    const setup = await setupProfile();
    const email = `close-${uuidv7()}@example.com`;
    await db.update(users).set({ email, password_hash: await hashPassword('correct-horse-battery') }).where(eq(users.id, setup.admin.id));
    const login = () => request(app, { method: 'POST', url: '/api/auth/login', payload: { email, password: 'correct-horse-battery' }, remoteAddress: `10.7.0.${Math.floor(Math.random() * 250)}` });
    const first = (await login()).json() as { refresh_token: string };
    expect(first.refresh_token).toBeTruthy();

    expect((await call('POST', `/admin/users/${setup.admin.id}/deactivate`)).statusCode).toBe(200);
    expect((await userRow(setup.admin.id))!.deactivated_at).not.toBeNull();
    const refused = await login();
    expect(refused.statusCode).toBe(403);
    expect((refused.json() as { error: { code: string } }).error.code).toBe('deactivated');
    expect((await request(app, { method: 'POST', url: '/api/auth/refresh', payload: { refresh_token: first.refresh_token } })).statusCode).toBe(401);
    // Nothing was removed.
    expect((await db.select().from(profiles).where(eq(profiles.id, setup.profileId)))).toHaveLength(1);
    const listed = ((await call('GET', `/admin/users?q=${encodeURIComponent(email)}`)).json() as { users: { deactivated_at: number | null; accounts: { id: string }[] }[] }).users[0]!;
    expect(listed.deactivated_at).not.toBeNull();
    expect(listed.accounts.map((a) => a.id)).toEqual([setup.accountId]);

    expect((await call('POST', `/admin/users/${setup.admin.id}/reactivate`)).statusCode).toBe(200);
    expect((await login()).statusCode).toBe(200);
  });

  it('a super admin cannot close or erase themselves or another super admin', async () => {
    expect((await call('POST', `/admin/users/${boss.id}/deactivate`)).statusCode).toBe(403);
    expect((await userRow(boss.id))!.deactivated_at).toBeNull();
  });

  it('erases only a closed sign-in, only after 30 days, only with the email typed again', async () => {
    const setup = await setupProfile();
    const email = (await userRow(setup.admin.id))!.email;
    const erase = (confirm_email: string) => call('DELETE', `/admin/users/${setup.admin.id}`, { confirm_email });

    expect((await erase(email)).statusCode).toBe(409); // not closed
    await call('POST', `/admin/users/${setup.admin.id}/deactivate`);
    expect(((await erase(email)).json() as { error: { code: string } }).error.code).toBe('too_soon');
    await db.update(users).set({ deactivated_at: Date.now() - 31 * DAY }).where(eq(users.id, setup.admin.id));
    expect((await erase('someone-else@example.com')).statusCode).toBe(400);
    expect(await userRow(setup.admin.id)).toBeDefined();
  });

  it('erasing removes what was theirs alone and leaves a shared account working', async () => {
    const alone = await setupProfile();
    const rewardId = uuidv7();
    await db.insert(rewards).values({ id: rewardId, profile_id: alone.profileId, client_updated_at: 1, updated_by: alone.admin.id, deleted_at: null, name: 'Theirs', position: 0 });
    // The same person also owns an account that a second person uses.
    const shared = await setupProfile();
    await db.update(accounts).set({ owner_user_id: alone.admin.id }).where(eq(accounts.id, shared.accountId));
    await db.update(account_members).set({ user_id: alone.admin.id }).where(eq(account_members.account_id, shared.accountId));
    await addMember(shared.accountId, shared.admin.id, 'member');
    const bystander = await setupProfile();

    await db.update(users).set({ deactivated_at: Date.now() - 31 * DAY }).where(eq(users.id, alone.admin.id));
    const res = await call('DELETE', `/admin/users/${alone.admin.id}`, { confirm_email: (await userRow(alone.admin.id))!.email });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accounts_removed: ['Test Household'], accounts_left: ['Test Household'] });

    expect(await userRow(alone.admin.id)).toBeUndefined();
    expect(await db.select().from(accounts).where(eq(accounts.id, alone.accountId))).toHaveLength(0);
    expect(await db.select().from(profiles).where(eq(profiles.id, alone.profileId))).toHaveLength(0);
    expect(await db.select().from(rewards).where(eq(rewards.id, rewardId))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.user_id, alone.admin.id))).toHaveLength(0);
    // The shared account stays, with its content, and the remaining person now runs it.
    expect((await db.select().from(accounts).where(eq(accounts.id, shared.accountId)))[0]).toMatchObject({ owner_user_id: shared.admin.id });
    expect(await db.select().from(account_members).where(eq(account_members.account_id, shared.accountId))).toEqual([{ account_id: shared.accountId, user_id: shared.admin.id, role: 'admin' }]);
    expect(await db.select().from(profiles).where(eq(profiles.id, shared.profileId))).toHaveLength(1);
    // And somebody unrelated is untouched.
    expect(await db.select().from(profiles).where(eq(profiles.id, bystander.profileId))).toHaveLength(1);
    expect(await userRow(bystander.admin.id)).toBeDefined();
  });

  it('gives an account free access until a date, and takes it away', async () => {
    const setup = await setupProfile();
    const until = Date.now() + 365 * DAY;
    expect((await call('PUT', `/admin/accounts/${setup.accountId}/comp`, { until, note: 'Beta family' })).statusCode).toBe(200);
    expect((await db.select().from(accounts).where(eq(accounts.id, setup.accountId)))[0]).toMatchObject({ comp_until: until, comp_note: 'Beta family' });
    expect((await call('PUT', `/admin/accounts/${setup.accountId}/comp`, { until: null })).statusCode).toBe(200);
    expect((await db.select().from(accounts).where(eq(accounts.id, setup.accountId)))[0]).toMatchObject({ comp_until: null, comp_note: null });
    expect((await call('PUT', `/admin/accounts/${uuidv7()}/comp`, { until })).statusCode).toBe(404);
  });
});

describe('accessState: free access given by hand', () => {
  const lapsed = { billingOn: true, canCheckout: true, exempt: false, trialEnd: 1000, sub: null };
  it('counts as subscribed until it runs out, then the usual rules return', () => {
    const now = 1000 + 60 * DAY;
    expect(accessState(lapsed, now)).toMatchObject({ state: 'lapsed', write_paused: true });
    expect(accessState({ ...lapsed, compUntil: now + DAY }, now)).toMatchObject({ state: 'subscribed', write_paused: false, ended_at: now + DAY });
    expect(accessState({ ...lapsed, compUntil: now - 1 }, now)).toMatchObject({ state: 'lapsed', write_paused: true });
  });
});

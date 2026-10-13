import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { createOrgWithOwnerInvite, orgOwnerPending } from '../src/lib/orgOwner.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { buildTestApp, request } from './helpers.js';
import { createUser } from './fixtures.js';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('org created for an owner invite', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function create(ownerEmail: string) {
    const staff = await createUser('Admin Site');
    const made = await createOrgWithOwnerInvite({ name: 'Bright Steps', ownerEmail, ownerName: 'Olga Owner', createdBy: staff.id, orgType: 'school' });
    const token = new URL(made.inviteUrl).searchParams.get('token')!;
    return { staff, made, token };
  }
  const accept = (token: string, bearer: string) => request(app, { method: 'POST', url: `/api/invites/${token}/accept`, headers: auth(bearer) });
  const ownerOf = async (accountId: string) => (await db.select().from(accounts).where(eq(accounts.id, accountId)))[0]!.owner_user_id;

  it('returns ids and an accept URL, the creator is not a member, and the owner is pending', async () => {
    const { staff, made } = await create('new-owner@example.com');
    expect(made.accountId).toBeTruthy();
    expect(made.inviteId).toBeTruthy();
    expect(made.inviteUrl).toContain('/invite/?token=');
    expect(await db.select().from(account_members).where(eq(account_members.account_id, made.accountId))).toHaveLength(0);
    const res = await request(app, { method: 'GET', url: `/api/accounts/${made.accountId}/profiles`, headers: auth(staff.token) });
    expect(res.statusCode).toBe(403);
    expect(await orgOwnerPending(made.accountId)).toBe(true);
  });

  it('a new user who signs up through the link becomes owner and admin', async () => {
    const { staff, made, token } = await create('fresh-owner@example.com');
    const reg = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'fresh-owner@example.com', password: 'correct-horse', display_name: 'fresh-owner@example.com', consented_at: Date.now(), invite_token: token },
    });
    expect(reg.statusCode).toBe(200);
    const bearer = (reg.json() as { access_token: string }).access_token;
    expect((await accept(token, bearer)).statusCode).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.email, 'fresh-owner@example.com'));
    expect(await ownerOf(made.accountId)).toBe(user!.id);
    expect(await ownerOf(made.accountId)).not.toBe(staff.id);
    const [member] = await db.select().from(account_members).where(eq(account_members.account_id, made.accountId));
    expect(member).toMatchObject({ user_id: user!.id, role: 'admin' });
    expect(user!.display_name).toBe('Olga Owner');

    const me = await request(app, { method: 'GET', url: '/api/me', headers: auth(bearer) });
    const row = (me.json() as { accounts: { account: { id: string; owner_user_id: string } }[] }).accounts.find((a) => a.account.id === made.accountId);
    expect(row?.account.owner_user_id).toBe(user!.id);
    expect(await orgOwnerPending(made.accountId)).toBe(false);
  });

  it('an existing user keeps their name and becomes owner', async () => {
    const { made, token } = await create('existing@example.com');
    const existing = await createUser('Eddie Existing');
    expect((await accept(token, existing.token)).statusCode).toBe(200);
    expect(await ownerOf(made.accountId)).toBe(existing.id);
    const [member] = await db.select().from(account_members).where(eq(account_members.account_id, made.accountId));
    expect(member).toMatchObject({ user_id: existing.id, role: 'admin' });
    const [user] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(user!.display_name).toBe('Eddie Existing');
    expect(await orgOwnerPending(made.accountId)).toBe(false);
  });

  it('a normal admin invite does not change the owner', async () => {
    const owner = await createUser('Real Owner');
    const made = await request(app, { method: 'POST', url: '/api/accounts', headers: auth(owner.token), payload: { kind: 'agency', name: 'Plain Org' } });
    const accountId = (made.json() as { account: { id: string } }).account.id;
    await request(app, { method: 'POST', url: `/api/accounts/${accountId}/invites`, headers: auth(owner.token), payload: { email: 'co@example.com', role: 'admin', profile_ids: [] } });
    const token = getLastMailMessage()!.text.match(/token=([^\s&]+)/)![1]!;
    const co = await createUser('Co Admin');
    expect((await accept(token, co.token)).statusCode).toBe(200);
    expect(await ownerOf(accountId)).toBe(owner.id);
  });
});

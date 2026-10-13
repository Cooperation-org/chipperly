import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { client_errors, email_log } from '../src/db/schema/adminTools.js';
import { admin_actions } from '../src/db/schema/subscriptions.js';
import { issueTokens } from '../src/lib/tokens.js';
import { env } from '../src/env.js';
import { sendMail } from '../src/lib/mailer.js';
import { base32Decode, base32Encode, checkPass, checkTotp, issuePass, openSecret, sealSecret, totp } from '../src/lib/twoStep.js';

const DAY = 24 * 60 * 60 * 1000;

async function createUser(label: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const id = uuidv7();
  const email = `${label}-${id}@example.com`;
  await db.insert(users).values({ id, email, display_name: label, created_at: Date.now(), ...extra });
  return { id, email, token: (await issueTokens(id)).access_token };
}
const auth = (token: string, step?: string) => ({ authorization: `Bearer ${token}`, ...(step ? { 'x-admin-step': step } : {}) });

describe('two-step codes', () => {
  it('matches the RFC 6238 test vectors (last 6 digits) and accepts one step of drift', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000)).toBe('081804');
    expect(checkTotp(secret, '287082', 59_000 + 30_000)).toBe(true);
    expect(checkTotp(secret, '287082', 59_000 + 90_000)).toBe(false);
    expect(checkTotp(secret, 'abc', 59_000)).toBe(false);
  });

  it('base32, sealing and passes round-trip; a tampered or expired pass is refused', () => {
    const secret = Buffer.from('hello two step secret');
    expect(base32Decode(base32Encode(secret))).toEqual(secret);
    expect(openSecret(sealSecret(secret))).toEqual(secret);
    const pass = issuePass('user-a', 1000);
    expect(checkPass('user-a', pass.token, 2000)).toBe(true);
    expect(checkPass('user-b', pass.token, 2000)).toBe(false);
    expect(checkPass('user-a', pass.token, pass.expires_at + 1)).toBe(false);
    expect(checkPass('user-a', `${pass.token}x`, 2000)).toBe(false);
  });
});

describe('admin tools', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    env.adminTwoStep = false;
    await app.close();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('with two-step on: setup, confirm, recovery codes, and the pass that every admin route needs', async () => {
    const boss = await createUser('twostep');
    env.superAdminEmails.add(boss.email);
    env.adminTwoStep = true;
    try {
      const blocked = await request(app, { method: 'GET', url: '/api/admin/users', headers: auth(boss.token) });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toMatchObject({ error: { code: 'two_step_setup' } });
      expect((await request(app, { method: 'GET', url: '/api/admin/2fa/status', headers: auth(boss.token) })).json()).toEqual({ required: true, enrolled: false });

      const setup = (await request(app, { method: 'POST', url: '/api/admin/2fa/setup', headers: auth(boss.token) })).json() as { secret: string; otpauth_url: string };
      expect(setup.otpauth_url).toContain(`secret=${setup.secret}`);
      // Asking again before confirming gives the same secret, so a scanned QR code stays good.
      const again = (await request(app, { method: 'POST', url: '/api/admin/2fa/setup', headers: auth(boss.token) })).json() as { secret: string };
      expect(again.secret).toBe(setup.secret);
      expect((await request(app, { method: 'POST', url: '/api/admin/2fa/confirm', headers: auth(boss.token), payload: { code: '000000' } })).statusCode).toBe(400);
      const confirmed = (await request(app, { method: 'POST', url: '/api/admin/2fa/confirm', headers: auth(boss.token), payload: { code: totp(base32Decode(setup.secret), Date.now()) } })).json() as {
        token: string;
        recovery_codes: string[];
      };
      expect(confirmed.recovery_codes).toHaveLength(10);
      expect((await request(app, { method: 'GET', url: '/api/admin/users', headers: auth(boss.token, confirmed.token) })).statusCode).toBe(200);

      // A second setup is refused; a later sign-in needs a code again, and a recovery code works exactly once.
      expect((await request(app, { method: 'POST', url: '/api/admin/2fa/setup', headers: auth(boss.token) })).statusCode).toBe(409);
      expect((await request(app, { method: 'GET', url: '/api/admin/users', headers: auth(boss.token) })).json()).toMatchObject({ error: { code: 'two_step_required' } });
      const recovery = confirmed.recovery_codes[0]!;
      expect((await request(app, { method: 'POST', url: '/api/admin/2fa/verify', headers: auth(boss.token), payload: { code: recovery.toLowerCase() } })).statusCode).toBe(200);
      expect((await request(app, { method: 'POST', url: '/api/admin/2fa/verify', headers: auth(boss.token), payload: { code: recovery } })).statusCode).toBe(400);
      expect((await request(app, { method: 'POST', url: '/api/admin/2fa/verify', headers: auth(boss.token), payload: { code: totp(base32Decode(setup.secret), Date.now()) } })).statusCode).toBe(200);

      // Someone who is not an admin cannot even start setup.
      const nobody = await createUser('nobody2fa');
      expect((await request(app, { method: 'POST', url: '/api/admin/2fa/setup', headers: auth(nobody.token) })).statusCode).toBe(403);
    } finally {
      env.adminTwoStep = false;
    }
    // A super admin resets it (lost phone).
    const other = await createUser('boss2');
    env.superAdminEmails.add(other.email);
    expect((await request(app, { method: 'DELETE', url: `/api/admin/users/${boss.id}/2fa`, headers: auth(other.token) })).statusCode).toBe(200);
    const [row] = await db.select({ at: users.totp_enabled_at, secret: users.totp_secret }).from(users).where(eq(users.id, boss.id));
    expect(row).toEqual({ at: null, secret: null });
  });

  it('insights list a trial ending within 7 days, but not the team, a paying account or one given free access', async () => {
    const boss = await createUser('insboss');
    env.superAdminEmails.add(boss.email);
    const soon = Date.now() + 3 * DAY;
    const ending = await createUser('ending', { trial_ends_at: soon });
    const comped = await createUser('comped', { trial_ends_at: soon });
    const accountId = uuidv7();
    await db.insert(accounts).values({ id: accountId, kind: 'household', name: 'Comped', created_at: Date.now(), owner_user_id: comped.id, comp_until: Date.now() + 30 * DAY });
    await db.insert(account_members).values({ account_id: accountId, user_id: comped.id, role: 'admin' });
    const later = await createUser('later', { trial_ends_at: Date.now() + 20 * DAY });
    const res = (await request(app, { method: 'GET', url: '/api/admin/insights', headers: auth(boss.token) })).json() as { trials_ending: Array<{ email: string }>; comp_accounts: number };
    const emails = res.trials_ending.map((t) => t.email);
    expect(emails).toContain(ending.email);
    expect(emails).not.toContain(comped.email);
    expect(emails).not.toContain(later.email);
    expect(emails).not.toContain(boss.email);
    expect(res.comp_accounts).toBeGreaterThanOrEqual(1);
  });

  it('every email is logged, and a person’s emails are listed for admins', async () => {
    const boss = await createUser('mailboss');
    env.superAdminEmails.add(boss.email);
    const person = await createUser('mailed');
    await sendMail({ to: person.email, subject: 'Hello there', text: 'Hi' });
    const [row] = await db.select().from(email_log).where(eq(email_log.to_email, person.email));
    expect(row).toMatchObject({ subject: 'Hello there', result: 'logged' });
    const list = (await request(app, { method: 'GET', url: `/api/admin/users/${person.id}/emails`, headers: auth(boss.token) })).json() as { emails: Array<{ subject: string }> };
    expect(list.emails[0]?.subject).toBe('Hello there');

    // Resending verification works for an unverified person and is logged.
    expect((await request(app, { method: 'POST', url: `/api/admin/users/${person.id}/resend-verification`, headers: auth(boss.token) })).statusCode).toBe(200);
    const sent = await db.select().from(email_log).where(eq(email_log.to_email, person.email));
    expect(sent.map((s) => s.subject)).toContain('Verify your Chipperly email');
  });

  it('browser error reports are stored and grouped by message', async () => {
    const boss = await createUser('errboss');
    env.superAdminEmails.add(boss.email);
    const message = `TypeError: x is undefined ${uuidv7()}`;
    for (const path of ['/today/', '/chips/', '/today/']) {
      expect((await request(app, { method: 'POST', url: '/api/client-errors', payload: { message, path, commit: 'abc123', stack: 'at f()' } })).statusCode).toBe(204);
    }
    const res = (await request(app, { method: 'GET', url: '/api/admin/client-errors', headers: auth(boss.token) })).json() as { groups: Array<{ message: string; count: number; paths: string[] }> };
    const group = res.groups.find((g) => g.message === message);
    expect(group?.count).toBe(3);
    expect(group?.paths.sort()).toEqual(['/chips/', '/today/']);
    // Old reports are dropped on the next insert.
    await db.insert(client_errors).values({ id: uuidv7(), at: Date.now() - 40 * DAY, message: 'ancient', path: '/' });
    await request(app, { method: 'POST', url: '/api/client-errors', payload: { message: 'fresh', path: '/' } });
    expect(await db.select().from(client_errors).where(eq(client_errors.message, 'ancient'))).toHaveLength(0);
  });

  it('waitlist: reads the website with the shared secret, emails the code with a filled-in link, and marks them invited', async () => {
    const boss = await createUser('wlboss');
    env.superAdminEmails.add(boss.email);
    const known = await createUser('wlknown');
    const prevSecret = env.CRON_SECRET;
    const prevCode = env.BETA_INVITE_CODE;
    (env as { CRON_SECRET?: string }).CRON_SECRET = 'x'.repeat(40);
    (env as { BETA_INVITE_CODE?: string }).BETA_INVITE_CODE = 'BETA-123';
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/internal/waitlist')) {
        return Response.json({ entries: [{ email: known.email, created_at: 1, invited_at: null }, { email: 'waitlist-new@example.com', name: 'Ana', created_at: 2, invited_at: null }] });
      }
      return Response.json({ ok: true });
    });
    try {
      const list = (await request(app, { method: 'GET', url: '/api/admin/waitlist', headers: auth(boss.token) })).json() as { entries: Array<{ email: string; has_account: boolean }>; code_required: boolean };
      expect(list.code_required).toBe(true);
      expect(list.entries.find((e) => e.email === known.email)?.has_account).toBe(true);
      expect(list.entries.find((e) => e.email === 'waitlist-new@example.com')?.has_account).toBe(false);
      expect((calls[0]!.init?.headers as Record<string, string>)['x-cron-secret']).toBe('x'.repeat(40));

      const sent = (await request(app, { method: 'POST', url: '/api/admin/waitlist/send-code', headers: auth(boss.token), payload: { emails: ['waitlist-new@example.com'] } })).json() as { sent: string[] };
      expect(sent.sent).toEqual(['waitlist-new@example.com']);
      const marked = calls.find((c) => c.url.endsWith('/internal/waitlist/invited'))!;
      expect(JSON.parse(String(marked.init?.body))).toEqual({ emails: ['waitlist-new@example.com'] });
    } finally {
      (env as { CRON_SECRET?: string }).CRON_SECRET = prevSecret;
      (env as { BETA_INVITE_CODE?: string }).BETA_INVITE_CODE = prevCode;
    }
    const [mail] = await db.select().from(email_log).where(eq(email_log.to_email, 'waitlist-new@example.com'));
    expect(mail?.subject).toBe('Your Chipperly beta invite');
    expect((await db.select().from(admin_actions).where(eq(admin_actions.action, 'beta_code_sent'))).length).toBeGreaterThan(0);
  });

  it('an organization made for a customer emails its owner the invite and is logged; support cannot do it', async () => {
    const boss = await createUser('orgboss');
    env.superAdminEmails.add(boss.email);
    const support = await createUser('orgsupport', { is_support: true });
    const body = { name: 'Sunrise Clinic', owner_name: 'Dana Lee', owner_email: 'dana@sunrise.example' };
    expect((await request(app, { method: 'POST', url: '/api/admin/orgs', headers: auth(support.token), payload: body })).statusCode).toBe(403);
    const res = (await request(app, { method: 'POST', url: '/api/admin/orgs', headers: auth(boss.token), payload: body })).json() as { account_id: string; invite_url: string };
    const [acct] = await db.select({ kind: accounts.kind, name: accounts.name }).from(accounts).where(eq(accounts.id, res.account_id));
    expect(acct).toEqual({ kind: 'agency', name: 'Sunrise Clinic' });
    const [mail] = await db.select().from(email_log).where(eq(email_log.to_email, 'dana@sunrise.example'));
    expect(mail?.subject).toBe('Sunrise Clinic is ready on Chipperly');
    expect((await db.select().from(admin_actions).where(eq(admin_actions.target, res.account_id)))[0]?.action).toBe('org_created');
  });
});

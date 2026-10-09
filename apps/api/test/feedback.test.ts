import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { feedback } from '../src/db/schema/feedback.js';
import { issueTokens } from '../src/lib/tokens.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { env } from '../src/env.js';

async function createUser(label: string): Promise<{ id: string; token: string; email: string }> {
  const id = uuidv7();
  const email = `${label}-${id}@example.com`;
  await db.insert(users).values({ id, email, display_name: label, created_at: Date.now() });
  return { id, email, token: (await issueTokens(id)).access_token };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('feedback', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    env.FEEDBACK_EMAIL_TO = undefined;
    await app.close();
  });

  // Each call comes from its own address so the per-IP rate limit does not see them as one person.
  let ip = 0;
  const send = (payload: unknown, headers?: Record<string, string>, remoteAddress = `10.1.0.${++ip}`) =>
    request(app, { method: 'POST', url: '/api/feedback', payload: payload as object, headers, remoteAddress });

  it('takes feedback from a guest and keeps an email only when they said we may write back', async () => {
    const msg = `guest idea ${uuidv7()}`;
    expect((await send({ kind: 'idea', message: msg, contact_ok: false, contact_email: 'hide-me@example.com' })).statusCode).toBe(201);
    const [row] = await db.select().from(feedback).where(eq(feedback.message, msg));
    expect(row).toMatchObject({ user_id: null, kind: 'idea', contact_email: null, status: 'new' });

    const msg2 = `guest ok ${uuidv7()}`;
    await send({ kind: 'love', message: msg2, rating: 5, contact_ok: true, contact_email: 'guest@example.com', q_price_monthly: 8 });
    const [row2] = await db.select().from(feedback).where(eq(feedback.message, msg2));
    expect(row2).toMatchObject({ contact_email: 'guest@example.com', rating: 5, q_price_monthly: 8 });
  });

  it('records who a signed-in person is and uses their account email', async () => {
    const me = await createUser('fb');
    const msg = `signed in ${uuidv7()}`;
    await send({ kind: 'bug', message: msg, contact_ok: true, page: '/chips/' }, auth(me.token));
    const [row] = await db.select().from(feedback).where(eq(feedback.message, msg));
    expect(row).toMatchObject({ user_id: me.id, contact_email: me.email, page: '/chips/' });
  });

  it('takes the survey with no message, and mails the answers', async () => {
    env.FEEDBACK_EMAIL_TO = 'team@example.com';
    const problem = `routine chaos ${uuidv7()}`;
    expect((await send({ kind: 'idea', message: '', q_problem: problem, q_helped: 'partly', q_price_monthly: 12 })).statusCode).toBe(201);
    const [row] = await db.select().from(feedback).where(eq(feedback.q_problem, problem));
    expect(row).toMatchObject({ message: '', q_helped: 'partly', q_price_monthly: 12, q_liked: null });
    const mail = getLastMailMessage();
    expect(mail?.text).toContain(problem);
    expect(mail?.text).toContain('12 dollars a month');
    env.FEEDBACK_EMAIL_TO = undefined;
  });

  it('stores an nps score with its reason', async () => {
    const why = `nps ${uuidv7()}`;
    expect((await send({ kind: 'nps', message: why, nps_score: 9 })).statusCode).toBe(201);
    const [row] = await db.select().from(feedback).where(eq(feedback.message, why));
    expect(row).toMatchObject({ kind: 'nps', nps_score: 9 });
    expect((await send({ kind: 'nps', message: '', nps_score: 0 })).statusCode).toBe(201);
    expect((await send({ kind: 'nps', message: 'x', nps_score: 11 })).statusCode).toBe(400);
  });

  it('refuses an empty message, a bad rating and an unknown kind', async () => {
    expect((await send({ kind: 'idea', message: '   ' })).statusCode).toBe(400);
    expect((await send({ kind: 'idea', message: '', q_problem: '  ' })).statusCode).toBe(400);
    expect((await send({ kind: 'idea', message: 'x', q_helped: 'maybe' })).statusCode).toBe(400);
    expect((await send({ kind: 'idea', message: 'x', q_liked: 'a'.repeat(2001) })).statusCode).toBe(400);
    expect((await send({ kind: 'idea', message: 'x', rating: 9 })).statusCode).toBe(400);
    expect((await send({ kind: 'rant', message: 'x' })).statusCode).toBe(400);
  });

  it('slows down one address that sends too much', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await send({ kind: 'idea', message: `spam ${i}` }, undefined, '10.9.9.9')).statusCode);
    expect(codes.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(codes[6]).toBe(429);
  });

  it('mails the team when FEEDBACK_EMAIL_TO is set', async () => {
    env.FEEDBACK_EMAIL_TO = 'team@example.com';
    await send({ kind: 'question', message: 'How do I add a second child?' });
    const mail = getLastMailMessage();
    expect(mail).toMatchObject({ to: 'team@example.com', subject: 'Chipperly feedback: A question' });
    expect(mail?.text).toContain('How do I add a second child?');
    expect(mail?.html).toContain('/settings/admin/feedback/');
    env.FEEDBACK_EMAIL_TO = undefined;
  });

  it('shows the inbox to super admins only, who can mark an item done', async () => {
    const boss = await createUser('fboss');
    const other = await createUser('fother');
    const msg = `inbox ${uuidv7()}`;
    await send({ kind: 'idea', message: msg });
    expect((await request(app, { method: 'GET', url: '/api/admin/feedback', headers: auth(other.token) })).statusCode).toBe(403);
    env.superAdminEmails.add(boss.email);
    const list = (await request(app, { method: 'GET', url: '/api/admin/feedback', headers: auth(boss.token) })).json() as { items: { id: string; message: string; status: string }[] };
    const item = list.items.find((i) => i.message === msg);
    expect(item?.status).toBe('new');
    const patch = await request(app, { method: 'PATCH', url: `/api/admin/feedback/${item!.id}`, headers: auth(boss.token), payload: { status: 'done' } });
    expect(patch.statusCode).toBe(200);
    const [row] = await db.select().from(feedback).where(eq(feedback.id, item!.id));
    expect(row?.status).toBe('done');
  });
});

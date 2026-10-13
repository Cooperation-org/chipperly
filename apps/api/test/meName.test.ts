import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { buildTestApp, request } from './helpers.js';
import { createUser } from './fixtures.js';

describe('PATCH /me/name', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('saves a trimmed display name for the signed-in user only', async () => {
    const me = await createUser('Before');
    const other = await createUser('Other');
    const res = await request(app, { method: 'PATCH', url: '/api/me/name', headers: { authorization: `Bearer ${me.token}` }, payload: { display_name: '  Sam  ' } });
    expect(res.statusCode).toBe(200);
    const [mine] = await db.select().from(users).where(eq(users.id, me.id));
    const [theirs] = await db.select().from(users).where(eq(users.id, other.id));
    expect(mine?.display_name).toBe('Sam');
    expect(theirs?.display_name).toBe('Other');
  });

  it('refuses an empty name and a signed-out caller', async () => {
    const me = await createUser();
    const empty = await request(app, { method: 'PATCH', url: '/api/me/name', headers: { authorization: `Bearer ${me.token}` }, payload: { display_name: '   ' } });
    expect(empty.statusCode).toBe(400);
    const anon = await request(app, { method: 'PATCH', url: '/api/me/name', payload: { display_name: 'Sam' } });
    expect(anon.statusCode).toBe(401);
  });
});

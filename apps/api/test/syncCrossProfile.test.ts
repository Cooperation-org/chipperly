import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { SyncPushResponseSchema } from '@chipperly/shared/schemas/sync';
import { sql } from '../src/db/client.js';
import { buildTestApp, expectShape, request } from './helpers.js';
import { createProfile, setupProfile } from './fixtures.js';

describe('sync push: a row id that belongs to another profile', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const activity = (id: string, profileId: string, userId: string, name: string) => ({
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: Date.now() + 10_000,
    updated_by: userId,
    deleted_at: null,
    name,
    emoji: '🎹',
    photo_id: null,
    chip_value: 1,
    location_id: null,
    recurrence: null,
    recurrence_weekdays: null,
    recurrence_time: null,
    position: 0,
  });

  const push = (token: string, profileId: string, mutations: object[]) =>
    request(app, { method: 'POST', url: '/api/sync/push', headers: { authorization: `Bearer ${token}` }, payload: { profile_id: profileId, mutations } });

  it('refuses an upsert and a delete of another profile\'s row, and leaves it alone', async () => {
    const { admin, accountId, profileId: a } = await setupProfile();
    const b = await createProfile(accountId, admin.id, 'Other');
    const id = uuidv7();
    const mk = (op: 'upsert' | 'delete', profileId: string, name: string) =>
      op === 'upsert'
        ? { table: 'activities', id, op, client_updated_at: Date.now() + 10_000, row: activity(id, profileId, admin.id, name) }
        : { table: 'activities', id, op, client_updated_at: Date.now() + 20_000 };

    const created = expectShape(await push(admin.token, b, [mk('upsert', b, 'Mine')]), SyncPushResponseSchema);
    expect(created.applied).toEqual([id]);

    // Pushed under profile A (which the user can write), naming B's row id.
    const overwrite = expectShape(await push(admin.token, a, [mk('upsert', a, 'Hijacked')]), SyncPushResponseSchema);
    expect(overwrite.rejected).toMatchObject([{ id, reason: 'forbidden' }]);
    const del = expectShape(await push(admin.token, a, [mk('delete', a, '')]), SyncPushResponseSchema);
    expect(del.rejected).toMatchObject([{ id, reason: 'forbidden' }]);

    const [row] = await sql`select name, profile_id, deleted_at from activities where id = ${id}`;
    expect(row).toMatchObject({ name: 'Mine', profile_id: b, deleted_at: null });
  });
});

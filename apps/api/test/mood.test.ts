import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { todayIso } from '@chipperly/shared/helpers/date';
import { buildTestApp, request } from './helpers.js';
import { setupProfile } from './fixtures.js';

interface MutationInput {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  row?: Record<string, unknown>;
  client_updated_at: number;
}

interface PushBody {
  applied: string[];
  rejected: Array<{ id: string; table: string; reason: string; server_row: Record<string, unknown> | null }>;
}

interface PullBody {
  changes: Record<string, Array<Record<string, unknown>>>;
}

function moodEventRow(
  id: string,
  profileId: string,
  userId: string,
  clientUpdatedAt: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: clientUpdatedAt,
    updated_by: userId,
    deleted_at: null,
    date: todayIso(),
    delta: 1,
    level_after: 1,
    created_at: clientUpdatedAt,
    created_by: userId,
    ...overrides,
  };
}

function pushRequest(app: FastifyInstance, token: string, profileId: string, mutations: MutationInput[]): Promise<LightMyRequestResponse> {
  return request(app, {
    method: 'POST',
    url: '/api/sync/push',
    headers: { authorization: `Bearer ${token}` },
    payload: { profile_id: profileId, mutations },
  });
}

function pullRequest(app: FastifyInstance, token: string, profileId: string, since = 0): Promise<LightMyRequestResponse> {
  return request(app, {
    method: 'GET',
    url: `/api/sync/pull?profile_id=${profileId}&since=${since}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('mood_events', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('pushes and pulls a mood event, and stays append-only on a repeat push of the same id', async () => {
    const { admin, profileId } = await setupProfile();
    const id = uuidv7();
    const now = Date.now();

    const push = await pushRequest(app, admin.token, profileId, [
      { table: 'mood_events', id, op: 'upsert', row: moodEventRow(id, profileId, admin.id, now), client_updated_at: now },
    ]);
    expect(push.statusCode).toBe(200);
    expect((push.json() as PushBody).applied).toEqual([id]);

    const pull = await pullRequest(app, admin.token, profileId);
    const rows = (pull.json() as PullBody).changes.mood_events;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, profile_id: profileId, date: todayIso(), delta: 1, level_after: 1, created_by: admin.id });

    // Append-only: a second upsert for the same id is `insert ... on conflict do nothing`
    // (routes/sync.ts applyAppendOnly), so the original row is never overwritten.
    const rePush = await pushRequest(app, admin.token, profileId, [
      { table: 'mood_events', id, op: 'upsert', row: moodEventRow(id, profileId, admin.id, now + 1, { level_after: 5, delta: 4 }), client_updated_at: now + 1 },
    ]);
    expect(rePush.statusCode).toBe(200);

    const pullAgain = await pullRequest(app, admin.token, profileId);
    expect((pullAgain.json() as PullBody).changes.mood_events[0]?.level_after).toBe(1);
  });

  it('rejects a level_after or delta outside the mood schema range', async () => {
    const { admin, profileId } = await setupProfile();
    const id = uuidv7();
    const now = Date.now();

    const push = await pushRequest(app, admin.token, profileId, [
      { table: 'mood_events', id, op: 'upsert', row: moodEventRow(id, profileId, admin.id, now, { level_after: 9 }), client_updated_at: now },
    ]);
    expect((push.json() as PushBody).rejected[0]?.reason).toBe('invalid');
  });

  it('allows a mood_events insert while the device is locked, unlike an ungated table', async () => {
    const { admin, profileId } = await setupProfile();
    await request(app, {
      method: 'POST',
      url: '/api/me/lock',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { profile_id: profileId },
    });

    const id = uuidv7();
    const now = Date.now();
    const moodPush = await pushRequest(app, admin.token, profileId, [
      { table: 'mood_events', id, op: 'upsert', row: moodEventRow(id, profileId, admin.id, now), client_updated_at: now },
    ]);
    expect((moodPush.json() as PushBody).applied).toEqual([id]);

    const gatedPush = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: uuidv7(), op: 'upsert', row: { name: 'Snack' }, client_updated_at: now },
    ]);
    expect((gatedPush.json() as PushBody).rejected[0]?.reason).toBe('locked');
  });
});

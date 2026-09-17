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
  version: number;
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

function activityRow(id: string, profileId: string, updatedBy: string, clientUpdatedAt: number): Record<string, unknown> {
  return {
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: clientUpdatedAt,
    updated_by: updatedBy,
    deleted_at: null,
    name: 'Brush Teeth',
    emoji: '🪥',
    photo_id: null,
    chip_value: 1,
    location_id: null,
    recurrence: null,
    recurrence_weekday: null,
    recurrence_time: null,
    position: 0,
  };
}

function scheduleItemRow(
  id: string,
  profileId: string,
  activityId: string,
  updatedBy: string,
  clientUpdatedAt: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: clientUpdatedAt,
    updated_by: updatedBy,
    deleted_at: null,
    date: todayIso(),
    position: 0,
    activity_id: activityId,
    start_time: null,
    part_of_day: null,
    source: 'manual',
    completed_at: null,
    completed_by: null,
    ...overrides,
  };
}

function chipLedgerRow(id: string, profileId: string, createdBy: string, clientUpdatedAt: number): Record<string, unknown> {
  return {
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: clientUpdatedAt,
    updated_by: createdBy,
    deleted_at: null,
    location_id: null,
    delta: 1,
    reason: 'manual',
    ref_id: null,
    created_at: clientUpdatedAt,
    created_by: createdBy,
  };
}

describe('sync push edge cases', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies a profiles upsert (share_token, jsonb settings) pulled straight from the server, rejects a stale replay as a clean 200, and tolerates unknown/missing keys', async () => {
    const { admin, profileId } = await setupProfile();

    const pull = await pullRequest(app, admin.token, profileId, 0);
    expect(pull.statusCode).toBe(200);
    const pullBody = pull.json() as { changes: Record<string, Record<string, unknown>[]> };
    const [storedProfile] = pullBody.changes.profiles ?? [];
    expect(storedProfile).toBeTruthy();
    const baseClientUpdatedAt = storedProfile!.client_updated_at as number;

    // (a) upsert: the pulled row, share_token set, a later client_updated_at -> applied.
    const shareToken = uuidv7();
    const applyAt = baseClientUpdatedAt + 1;
    const applied = await pushRequest(app, admin.token, profileId, [
      {
        table: 'profiles',
        id: profileId,
        op: 'upsert',
        row: { ...storedProfile, share_token: shareToken, client_updated_at: applyAt },
        client_updated_at: applyAt,
      },
    ]);
    expect(applied.statusCode).toBe(200);
    const appliedBody = applied.json() as PushBody;
    expect(appliedBody.rejected).toEqual([]);
    expect(appliedBody.applied).toEqual([profileId]);

    const afterApply = await pullRequest(app, admin.token, profileId, 0);
    const afterApplyProfile = ((afterApply.json() as { changes: Record<string, Record<string, unknown>[]> }).changes.profiles ?? [])[0];
    expect(afterApplyProfile).toMatchObject({ share_token: shareToken });
    // The jsonb `settings` column round-trips as an object, never the
    // "[object Object]" string a missing sql.json() wrapper would produce.
    expect(typeof afterApplyProfile?.settings).toBe('object');

    // (b) same mutation, client_updated_at one behind what's now stored -> clean 'stale' 200, never a 500.
    const staleAt = applyAt - 1;
    const stale = await pushRequest(app, admin.token, profileId, [
      {
        table: 'profiles',
        id: profileId,
        op: 'upsert',
        row: { ...storedProfile, share_token: uuidv7(), client_updated_at: staleAt },
        client_updated_at: staleAt,
      },
    ]);
    expect(stale.statusCode).toBe(200);
    const staleBody = stale.json() as PushBody;
    expect(staleBody.applied).toEqual([]);
    expect(staleBody.rejected).toHaveLength(1);
    expect(staleBody.rejected[0]?.reason).toBe('stale');
    expect(staleBody.rejected[0]?.server_row).toMatchObject({ id: profileId, share_token: shareToken });

    // (c) extra unknown keys + a missing optional (nested settings) key -> still a clean 200.
    const { timer_default_minutes: _dropped, ...settingsWithoutOptionalKey } = (afterApplyProfile?.settings ?? {}) as Record<
      string,
      unknown
    >;
    const messyAt = applyAt + 1;
    const messy = await pushRequest(app, admin.token, profileId, [
      {
        table: 'profiles',
        id: profileId,
        op: 'upsert',
        row: {
          ...afterApplyProfile,
          settings: settingsWithoutOptionalKey,
          this_key_does_not_exist: 'ignored',
          client_updated_at: messyAt,
        },
        client_updated_at: messyAt,
      },
    ]);
    expect(messy.statusCode).toBe(200);
    const messyBody = messy.json() as PushBody;
    expect(messyBody.rejected).toEqual([]);
    expect(messyBody.applied).toEqual([profileId]);
  });

  it('inserts a new schedule_items row then applies a later completion update, both applied', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();
    const itemId = uuidv7();
    const t0 = Date.now();

    const create = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0), client_updated_at: t0 },
      {
        table: 'schedule_items',
        id: itemId,
        op: 'upsert',
        row: scheduleItemRow(itemId, profileId, activityId, admin.id, t0),
        client_updated_at: t0,
      },
    ]);
    expect(create.statusCode).toBe(200);
    const createBody = create.json() as PushBody;
    expect(createBody.rejected).toEqual([]);
    expect(createBody.applied.sort()).toEqual([activityId, itemId].sort());

    const t1 = t0 + 1000;
    const complete = await pushRequest(app, admin.token, profileId, [
      {
        table: 'schedule_items',
        id: itemId,
        op: 'upsert',
        row: scheduleItemRow(itemId, profileId, activityId, admin.id, t1, { completed_at: t1, completed_by: admin.id }),
        client_updated_at: t1,
      },
    ]);
    expect(complete.statusCode).toBe(200);
    const completeBody = complete.json() as PushBody;
    expect(completeBody.rejected).toEqual([]);
    expect(completeBody.applied).toEqual([itemId]);
  });

  it('rejects a zod-invalid row as a clean 200 with reason "invalid", never a 500', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();

    const invalid = await pushRequest(app, admin.token, profileId, [
      {
        table: 'activities',
        id: activityId,
        op: 'upsert',
        // `chip_value` must be a number; this row fails TABLE_SCHEMAS.activities.safeParse.
        row: { ...activityRow(activityId, profileId, admin.id, Date.now()), chip_value: 'not-a-number' },
        client_updated_at: Date.now(),
      },
    ]);
    expect(invalid.statusCode).toBe(200);
    const body = invalid.json() as PushBody;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({ id: activityId, table: 'activities', reason: 'invalid' });
  });

  it('resolves 50 concurrent pushes against one profile within 15s (no pool stall)', async () => {
    const { admin, profileId } = await setupProfile();
    const base = Date.now();

    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => {
        const id = uuidv7();
        return pushRequest(app, admin.token, profileId, [
          { table: 'chip_ledger', id, op: 'upsert', row: chipLedgerRow(id, profileId, admin.id, base + i), client_updated_at: base + i },
        ]);
      }),
    );
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(15_000);
    for (const result of results) {
      expect(result.statusCode).toBe(200);
      expect((result.json() as PushBody).rejected).toEqual([]);
    }
  }, 20_000);
});

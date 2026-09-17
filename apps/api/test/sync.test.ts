import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { ActivitySchema } from '@chipperly/shared/schemas/activity';
import { ScheduleItemSchema } from '@chipperly/shared/schemas/schedule';
import { ChipLedgerSchema } from '@chipperly/shared/schemas/chips';
import { balanceFor } from '@chipperly/shared/helpers/chips';
import { todayIso } from '@chipperly/shared/helpers/date';
import { buildTestApp, request } from './helpers.js';
import { addMember, createUser, setupProfile, type TestProfileSetup } from './fixtures.js';

interface MutationInput {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  row?: Record<string, unknown>;
  client_updated_at: number;
}

function pushRequest(
  app: FastifyInstance,
  token: string,
  profileId: string,
  mutations: MutationInput[],
  locked = false,
): Promise<LightMyRequestResponse> {
  return request(app, {
    method: 'POST',
    url: '/api/sync/push',
    headers: { authorization: `Bearer ${token}`, ...(locked ? { 'x-locked': '1' } : {}) },
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

function activityRow(
  id: string,
  profileId: string,
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
    name: 'Practice Piano',
    emoji: '🎹',
    photo_id: null,
    chip_value: 1,
    location_id: null,
    recurrence: null,
    recurrence_weekday: null,
    recurrence_time: null,
    position: 0,
    ...overrides,
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

function chipLedgerRow(
  id: string,
  profileId: string,
  createdBy: string,
  clientUpdatedAt: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    profile_id: profileId,
    version: 0,
    client_updated_at: clientUpdatedAt,
    updated_by: createdBy,
    deleted_at: null,
    location_id: null,
    delta: 2,
    reason: 'manual',
    ref_id: null,
    created_at: clientUpdatedAt,
    created_by: createdBy,
    ...overrides,
  };
}

describe('sync', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('converges two diverged clients to identical rows and chip balance', async () => {
    const { admin, profileId } = await setupProfile();

    const activityId = uuidv7();
    const itemId = uuidv7();
    const t0 = Date.now();

    // Client A: creates an activity and a schedule item for it.
    const pushA = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0), client_updated_at: t0 },
      {
        table: 'schedule_items',
        id: itemId,
        op: 'upsert',
        row: scheduleItemRow(itemId, profileId, activityId, admin.id, t0),
        client_updated_at: t0,
      },
    ]);
    expect(pushA.statusCode).toBe(200);
    const pushABody = pushA.json() as { applied: string[]; rejected: unknown[]; version: number };
    expect(pushABody.applied.sort()).toEqual([activityId, itemId].sort());
    expect(pushABody.rejected).toEqual([]);

    // Client B: diverged, records a chip and completes the same item with a later client_updated_at.
    const ledgerId = uuidv7();
    const t1 = t0 + 1000;
    const pushB = await pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, t1), client_updated_at: t1 },
      {
        table: 'schedule_items',
        id: itemId,
        op: 'upsert',
        row: scheduleItemRow(itemId, profileId, activityId, admin.id, t1, { completed_at: t1, completed_by: admin.id }),
        client_updated_at: t1,
      },
    ]);
    expect(pushB.statusCode).toBe(200);
    const pushBBody = pushB.json() as { applied: string[]; rejected: unknown[]; version: number };
    expect(pushBBody.applied.sort()).toEqual([ledgerId, itemId].sort());
    expect(pushBBody.rejected).toEqual([]);

    // Both clients pull from since=0: identical row sets.
    const pullAFull = await pullRequest(app, admin.token, profileId, 0);
    const pullBFull = await pullRequest(app, admin.token, profileId, 0);
    expect(pullAFull.statusCode).toBe(200);
    const bodyAFull = pullAFull.json() as { changes: Record<string, Record<string, unknown>[]>; version: number; has_more: boolean };
    const bodyBFull = pullBFull.json() as { changes: Record<string, Record<string, unknown>[]>; version: number; has_more: boolean };
    expect(bodyBFull.changes).toEqual(bodyAFull.changes);
    expect(bodyBFull.version).toBe(bodyAFull.version);

    // The schedule item converged to B's later completion, not A's original.
    const [convergedItem] = bodyAFull.changes.schedule_items ?? [];
    expect(convergedItem).toMatchObject({ id: itemId, completed_at: t1, completed_by: admin.id });
    ScheduleItemSchema.parse(convergedItem);

    const [convergedActivity] = bodyAFull.changes.activities ?? [];
    expect(convergedActivity).toMatchObject({ id: activityId });
    ActivitySchema.parse(convergedActivity);

    for (const row of bodyAFull.changes.chip_ledger ?? []) ChipLedgerSchema.parse(row);

    // Pulling from each client's own cursor only returns what happened after it.
    const pullFromACursor = await pullRequest(app, admin.token, profileId, pushABody.version);
    const bodyFromACursor = pullFromACursor.json() as { changes: Record<string, Record<string, unknown>[]>; has_more: boolean };
    expect(bodyFromACursor.changes.chip_ledger).toHaveLength(1);
    expect(bodyFromACursor.changes.schedule_items).toHaveLength(1);
    expect(bodyFromACursor.changes.activities ?? []).toHaveLength(0);

    const pullFromBCursor = await pullRequest(app, admin.token, profileId, pushBBody.version);
    const bodyFromBCursor = pullFromBCursor.json() as { changes: Record<string, Record<string, unknown>[]>; has_more: boolean };
    for (const rows of Object.values(bodyFromBCursor.changes)) expect(rows).toHaveLength(0);
    expect(bodyFromBCursor.has_more).toBe(false);

    // Identical chip balance derived from each pull's ledger.
    const balanceFromA = balanceFor(bodyAFull.changes.chip_ledger as never, null);
    const balanceFromB = balanceFor(bodyBFull.changes.chip_ledger as never, null);
    expect(balanceFromA).toBe(2);
    expect(balanceFromB).toBe(2);
  });

  it('rejects a stale LWW push and returns the current server row', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();
    const t0 = Date.now();

    const first = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0, { name: 'First' }), client_updated_at: t0 },
    ]);
    expect((first.json() as { applied: string[] }).applied).toEqual([activityId]);

    const stale = await pushRequest(app, admin.token, profileId, [
      {
        table: 'activities',
        id: activityId,
        op: 'upsert',
        row: activityRow(activityId, profileId, admin.id, t0 - 500, { name: 'Stale edit' }),
        client_updated_at: t0 - 500,
      },
    ]);
    expect(stale.statusCode).toBe(200);
    const staleBody = stale.json() as { applied: string[]; rejected: Array<{ id: string; reason: string; server_row: Record<string, unknown> | null }> };
    expect(staleBody.applied).toEqual([]);
    expect(staleBody.rejected).toHaveLength(1);
    expect(staleBody.rejected[0]?.reason).toBe('stale');
    expect(staleBody.rejected[0]?.server_row).toMatchObject({ id: activityId, name: 'First' });
  });

  it('is a no-op, and still counts as applied, when an append-only id is pushed twice', async () => {
    const { admin, profileId } = await setupProfile();
    const ledgerId = uuidv7();
    const t0 = Date.now();

    const first = await pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, t0, { delta: 3 }), client_updated_at: t0 },
    ]);
    expect((first.json() as { applied: string[] }).applied).toEqual([ledgerId]);

    const second = await pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, t0 + 1, { delta: 999 }), client_updated_at: t0 + 1 },
    ]);
    const secondBody = second.json() as { applied: string[]; rejected: unknown[] };
    expect(secondBody.applied).toEqual([ledgerId]);
    expect(secondBody.rejected).toEqual([]);

    const pull = await pullRequest(app, admin.token, profileId, 0);
    const body = pull.json() as { changes: Record<string, Record<string, unknown>[]> };
    const rows = body.changes.chip_ledger ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.delta).toBe(3);
  });

  it('under X-Locked, rejects an activity upsert but allows a completion', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();
    const itemId = uuidv7();
    const t0 = Date.now();

    await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0), client_updated_at: t0 },
      { table: 'schedule_items', id: itemId, op: 'upsert', row: scheduleItemRow(itemId, profileId, activityId, admin.id, t0), client_updated_at: t0 },
    ]);

    const otherActivityId = uuidv7();
    const t1 = t0 + 1000;
    const lockedPush = await pushRequest(
      app,
      admin.token,
      profileId,
      [
        { table: 'activities', id: otherActivityId, op: 'upsert', row: activityRow(otherActivityId, profileId, admin.id, t1), client_updated_at: t1 },
        {
          table: 'schedule_items',
          id: itemId,
          op: 'upsert',
          row: scheduleItemRow(itemId, profileId, activityId, admin.id, t1, { completed_at: t1, completed_by: admin.id }),
          client_updated_at: t1,
        },
      ],
      true,
    );
    expect(lockedPush.statusCode).toBe(200);
    const body = lockedPush.json() as { applied: string[]; rejected: Array<{ id: string; table: string; reason: string }> };
    expect(body.applied).toEqual([itemId]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({ id: otherActivityId, table: 'activities', reason: 'locked' });
  });

  it('rejects a member with no profile_members access with 403', async () => {
    const { admin, accountId, profileId } = await setupProfile();
    void admin;
    const outsider = await createUser('Outsider');
    await addMember(accountId, outsider.id, 'member');

    const pull = await pullRequest(app, outsider.token, profileId, 0);
    expect(pull.statusCode).toBe(403);

    const push = await pushRequest(app, outsider.token, profileId, [
      { table: 'activities', id: uuidv7(), op: 'upsert', row: activityRow(uuidv7(), profileId, outsider.id, Date.now()), client_updated_at: Date.now() },
    ]);
    expect(push.statusCode).toBe(403);
  });

  it('paginates the pull at 500 rows and reports has_more', async () => {
    const setup: TestProfileSetup = await setupProfile();
    const { admin, profileId } = setup;

    const mutations: MutationInput[] = [];
    const base = Date.now();
    for (let i = 0; i < 600; i += 1) {
      const id = uuidv7();
      mutations.push({
        table: 'chip_ledger',
        id,
        op: 'upsert',
        row: chipLedgerRow(id, profileId, admin.id, base + i, { delta: 1 }),
        client_updated_at: base + i,
      });
    }
    const push = await pushRequest(app, admin.token, profileId, mutations);
    expect(push.statusCode).toBe(200);
    const pushBody = push.json() as { applied: string[]; rejected: unknown[] };
    expect(pushBody.applied).toHaveLength(600);
    expect(pushBody.rejected).toEqual([]);

    // The profile's own row is part of the same synced stream (created before any ledger row,
    // so it sorts first) and takes one of the 500 slots on the first page.
    const firstPage = await pullRequest(app, admin.token, profileId, 0);
    const firstBody = firstPage.json() as { changes: Record<string, unknown[]>; version: number; has_more: boolean };
    const firstPageTotal = Object.values(firstBody.changes).reduce((sum, rows) => sum + rows.length, 0);
    expect(firstPageTotal).toBe(500);
    expect(firstBody.changes.profiles).toHaveLength(1);
    expect(firstBody.changes.chip_ledger).toHaveLength(499);
    expect(firstBody.has_more).toBe(true);

    const secondPage = await pullRequest(app, admin.token, profileId, firstBody.version);
    const secondBody = secondPage.json() as { changes: Record<string, unknown[]>; has_more: boolean };
    const secondPageTotal = Object.values(secondBody.changes).reduce((sum, rows) => sum + rows.length, 0);
    expect(secondPageTotal).toBe(101);
    expect(secondBody.changes.chip_ledger).toHaveLength(101);
    expect(secondBody.has_more).toBe(false);
  });
});

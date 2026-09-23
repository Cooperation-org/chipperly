import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { ActivitySchema, ActivityStepSchema } from '@chipperly/shared/schemas/activity';
import { ScheduleItemSchema } from '@chipperly/shared/schemas/schedule';
import { ChipLedgerSchema } from '@chipperly/shared/schemas/chips';
import { SyncPullResponseSchema, SyncPushResponseSchema } from '@chipperly/shared/schemas/sync';
import type { MutationTable } from '@chipperly/shared/constants/tables';
import { balanceFor } from '@chipperly/shared/helpers/chips';
import { todayIso } from '@chipperly/shared/helpers/date';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { profiles } from '../src/db/schema/profiles.js';
import { buildTestApp, expectShape, request } from './helpers.js';
import { addMember, createUser, setupProfile, type TestProfileSetup } from './fixtures.js';
import { sql } from '../src/db/client.js';
import { TABLE_SCHEMAS, nextAllowances, nextUnrestrictedUntil } from '../src/routes/sync.js';

/** Every row of every table in a pull's `changes`, checked against that table's own shared row schema. */
function expectChangesShape(changes: Record<string, unknown[]>): void {
  for (const [table, rows] of Object.entries(changes)) {
    const schema = TABLE_SCHEMAS[table as MutationTable];
    for (const row of rows) schema.parse(row);
  }
}

interface MutationInput {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  row?: Record<string, unknown>;
  client_updated_at: number;
}

/**
 * `locked` locks this session server-side first (POST /me/lock -- the
 * server derives `request.locked` from the session row, never from a
 * client header; see plugins/auth.ts).
 */
async function pushRequest(
  app: FastifyInstance,
  token: string,
  profileId: string,
  mutations: MutationInput[],
  locked = false,
): Promise<LightMyRequestResponse> {
  if (locked) {
    await request(app, {
      method: 'POST',
      url: '/api/me/lock',
      headers: { authorization: `Bearer ${token}` },
      payload: { profile_id: profileId },
    });
  }
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
    recurrence_weekdays: null,
    recurrence_time: null,
    position: 0,
    ...overrides,
  };
}

function activityStepRow(
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
    activity_id: activityId,
    parent_step_id: null,
    position: 0,
    name: 'Brush teeth',
    emoji: null,
    photo_id: null,
    duration_minutes: null,
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

function locationRow(
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
    name: 'Home',
    emoji: null,
    photo_id: null,
    position: 0,
    chip_goal: 5,
    working_for_reward_id: null,
    lat: null,
    lng: null,
    radius_m: null,
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

function stepCompletionRow(
  id: string,
  profileId: string,
  itemId: string,
  stepId: string,
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
    schedule_item_id: itemId,
    activity_step_id: stepId,
    completed_at: clientUpdatedAt,
    completed_by: updatedBy,
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
    const pushABody = expectShape(pushA, SyncPushResponseSchema);
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
    const pushBBody = expectShape(pushB, SyncPushResponseSchema);
    expect(pushBBody.applied.sort()).toEqual([ledgerId, itemId].sort());
    expect(pushBBody.rejected).toEqual([]);

    // Both clients pull from since=0: identical row sets.
    const pullAFull = await pullRequest(app, admin.token, profileId, 0);
    const pullBFull = await pullRequest(app, admin.token, profileId, 0);
    expect(pullAFull.statusCode).toBe(200);
    const bodyAFull = expectShape(pullAFull, SyncPullResponseSchema);
    const bodyBFull = expectShape(pullBFull, SyncPullResponseSchema);
    expectChangesShape(bodyAFull.changes);
    expectChangesShape(bodyBFull.changes);
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
    const bodyFromACursor = expectShape(pullFromACursor, SyncPullResponseSchema);
    expectChangesShape(bodyFromACursor.changes);
    expect(bodyFromACursor.changes.chip_ledger).toHaveLength(1);
    expect(bodyFromACursor.changes.schedule_items).toHaveLength(1);
    expect(bodyFromACursor.changes.activities ?? []).toHaveLength(0);

    const pullFromBCursor = await pullRequest(app, admin.token, profileId, pushBBody.version);
    const bodyFromBCursor = expectShape(pullFromBCursor, SyncPullResponseSchema);
    for (const rows of Object.values(bodyFromBCursor.changes)) expect(rows).toHaveLength(0);
    expect(bodyFromBCursor.has_more).toBe(false);

    // Identical chip balance derived from each pull's ledger.
    const balanceFromA = balanceFor(bodyAFull.changes.chip_ledger as never, null);
    const balanceFromB = balanceFor(bodyBFull.changes.chip_ledger as never, null);
    expect(balanceFromA).toBe(2);
    expect(balanceFromB).toBe(2);
  });

  it('pushes an activity with recurrence_weekdays and a timed step and pulls it back', async () => {
    const { admin, profileId } = await setupProfile();

    const activityId = uuidv7();
    const stepId = uuidv7();
    const t0 = Date.now();

    const push = await pushRequest(app, admin.token, profileId, [
      {
        table: 'activities',
        id: activityId,
        op: 'upsert',
        row: activityRow(activityId, profileId, admin.id, t0, { recurrence: 'weekly', recurrence_weekdays: [1, 3] }),
        client_updated_at: t0,
      },
      {
        table: 'activity_steps',
        id: stepId,
        op: 'upsert',
        row: activityStepRow(stepId, profileId, activityId, admin.id, t0, { duration_minutes: 5 }),
        client_updated_at: t0,
      },
    ]);
    expect(push.statusCode).toBe(200);
    const pushBody = expectShape(push, SyncPushResponseSchema);
    expect(pushBody.applied.sort()).toEqual([activityId, stepId].sort());
    expect(pushBody.rejected).toEqual([]);

    const pull = await pullRequest(app, admin.token, profileId, 0);
    expect(pull.statusCode).toBe(200);
    const pullBody = expectShape(pull, SyncPullResponseSchema);
    expectChangesShape(pullBody.changes);

    const [pulledActivity] = pullBody.changes.activities ?? [];
    expect(pulledActivity).toMatchObject({ id: activityId, recurrence: 'weekly', recurrence_weekdays: [1, 3] });
    ActivitySchema.parse(pulledActivity);

    const [pulledStep] = pullBody.changes.activity_steps ?? [];
    expect(pulledStep).toMatchObject({ id: stepId, duration_minutes: 5 });
    ActivityStepSchema.parse(pulledStep);
  });

  it('pushes a nested step (parent_step_id) and pulls it back on the tree', async () => {
    const { admin, profileId } = await setupProfile();

    const activityId = uuidv7();
    const rootStepId = uuidv7();
    const childStepId = uuidv7();
    const t0 = Date.now();

    const push = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0), client_updated_at: t0 },
      {
        table: 'activity_steps',
        id: rootStepId,
        op: 'upsert',
        row: activityStepRow(rootStepId, profileId, activityId, admin.id, t0, { name: 'Get dressed' }),
        client_updated_at: t0,
      },
      {
        table: 'activity_steps',
        id: childStepId,
        op: 'upsert',
        row: activityStepRow(childStepId, profileId, activityId, admin.id, t0, {
          name: 'Put on socks',
          parent_step_id: rootStepId,
          position: 0,
        }),
        client_updated_at: t0,
      },
    ]);
    expect(push.statusCode).toBe(200);
    const pushBody = expectShape(push, SyncPushResponseSchema);
    expect(pushBody.applied.sort()).toEqual([activityId, rootStepId, childStepId].sort());
    expect(pushBody.rejected).toEqual([]);

    const pull = await pullRequest(app, admin.token, profileId, 0);
    const pullBody = expectShape(pull, SyncPullResponseSchema);
    expectChangesShape(pullBody.changes);

    const steps = pullBody.changes.activity_steps ?? [];
    const pulledRoot = steps.find((s) => (s as { id: string }).id === rootStepId);
    const pulledChild = steps.find((s) => (s as { id: string }).id === childStepId);
    expect(pulledRoot).toMatchObject({ id: rootStepId, parent_step_id: null });
    expect(pulledChild).toMatchObject({ id: childStepId, parent_step_id: rootStepId });
    ActivityStepSchema.parse(pulledRoot);
    ActivityStepSchema.parse(pulledChild);
  });

  it('rejects a stale LWW push and returns the current server row', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();
    const t0 = Date.now();

    const first = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0, { name: 'First' }), client_updated_at: t0 },
    ]);
    expect(expectShape(first, SyncPushResponseSchema).applied).toEqual([activityId]);

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
    const staleBody = expectShape(stale, SyncPushResponseSchema);
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
    expect(expectShape(first, SyncPushResponseSchema).applied).toEqual([ledgerId]);

    const second = await pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, t0 + 1, { delta: 999 }), client_updated_at: t0 + 1 },
    ]);
    const secondBody = expectShape(second, SyncPushResponseSchema);
    expect(secondBody.applied).toEqual([ledgerId]);
    expect(secondBody.rejected).toEqual([]);

    const pull = await pullRequest(app, admin.token, profileId, 0);
    const body = expectShape(pull, SyncPullResponseSchema);
    expectChangesShape(body.changes);
    const rows = body.changes.chip_ledger ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.delta).toBe(3);
  });

  it('actually applies a delete on an append-only row: unchecking a step reaches the server', async () => {
    const { admin, profileId } = await setupProfile();
    const itemId = uuidv7();
    const stepId = uuidv7();
    const completionId = uuidv7();
    const t0 = Date.now();

    const checked = await pushRequest(app, admin.token, profileId, [
      {
        table: 'step_completions',
        id: completionId,
        op: 'upsert',
        row: stepCompletionRow(completionId, profileId, itemId, stepId, admin.id, t0),
        client_updated_at: t0,
      },
    ]);
    expect(expectShape(checked, SyncPushResponseSchema).applied).toEqual([completionId]);

    const unchecked = await pushRequest(app, admin.token, profileId, [
      { table: 'step_completions', id: completionId, op: 'delete', client_updated_at: t0 + 1000 },
    ]);
    const uncheckedBody = expectShape(unchecked, SyncPushResponseSchema);
    expect(uncheckedBody.applied).toEqual([completionId]);
    expect(uncheckedBody.rejected).toEqual([]);

    const pull = await pullRequest(app, admin.token, profileId, 0);
    const body = expectShape(pull, SyncPullResponseSchema);
    expectChangesShape(body.changes);
    const row = (body.changes.step_completions ?? []).find((r) => r.id === completionId);
    expect(row?.deleted_at).not.toBeNull();
  });

  it('a locked device can also push that uncheck: the lock gate allows delete, not only upsert, for step_completions', async () => {
    const { admin, profileId } = await setupProfile();
    const itemId = uuidv7();
    const stepId = uuidv7();
    const completionId = uuidv7();
    const t0 = Date.now();

    await pushRequest(app, admin.token, profileId, [
      {
        table: 'step_completions',
        id: completionId,
        op: 'upsert',
        row: stepCompletionRow(completionId, profileId, itemId, stepId, admin.id, t0),
        client_updated_at: t0,
      },
    ]);

    const lockedDelete = await pushRequest(
      app,
      admin.token,
      profileId,
      [{ table: 'step_completions', id: completionId, op: 'delete', client_updated_at: t0 + 1000 }],
      true,
    );
    const body = expectShape(lockedDelete, SyncPushResponseSchema);
    expect(body.applied).toEqual([completionId]);
    expect(body.rejected).toEqual([]);
  });

  it('serializes concurrent pushes to the same profile behind an advisory lock, so version order cannot outrun commit order', async () => {
    const { admin, profileId } = await setupProfile();

    // Holds the exact lock key /sync/push takes (sync.ts) from a separate
    // raw transaction, so a concurrent push for the same profile has to
    // wait behind it -- proving the route actually serializes per profile
    // instead of letting a slower writer's version commit after a faster
    // one's has already been read as a pull cursor.
    let releaseHold: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    const holdTx = sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${profileId}))`;
      await held;
    });

    let pushSettled = false;
    const ledgerId = uuidv7();
    const pushPromise = pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, Date.now()), client_updated_at: Date.now() },
    ]).then((res) => {
      pushSettled = true;
      return res;
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(pushSettled).toBe(false);

    releaseHold?.();
    await holdTx;
    const res = await pushPromise;
    expect(pushSettled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(expectShape(res, SyncPushResponseSchema).applied).toEqual([ledgerId]);
  });

  it('under a server-side lock (POST /me/lock), rejects an activity upsert but allows a completion', async () => {
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
    const body = expectShape(lockedPush, SyncPushResponseSchema);
    expect(body.applied).toEqual([itemId]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({ id: otherActivityId, table: 'activities', reason: 'locked' });
  });

  it('a locked child redeeming clears working_for_reward_id even with child_picks_reward off', async () => {
    // lib/data/chips.ts `redeem` writes the ledger row and the working-for
    // clear together; if the gate took only child_picks_reward into account,
    // the ledger half would apply and the clear would be rejected, leaving
    // that one device showing a reward nobody else sees cleared.
    const { admin, profileId } = await setupProfile();
    await db
      .update(profiles)
      .set({ settings: { child_picks_reward: false, child_redeems: true } })
      .where(eq(profiles.id, profileId));

    const locationId = uuidv7();
    const rewardId = uuidv7();
    const t0 = Date.now();
    await pushRequest(app, admin.token, profileId, [
      { table: 'locations', id: locationId, op: 'upsert', row: locationRow(locationId, profileId, admin.id, t0, { working_for_reward_id: rewardId }), client_updated_at: t0 },
    ]);

    const t1 = t0 + 1000;
    const ledgerId = uuidv7();
    const locked = await pushRequest(
      app,
      admin.token,
      profileId,
      [
        { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, t1, { delta: -5, reason: 'redeem', ref_id: rewardId, location_id: locationId }), client_updated_at: t1 },
        { table: 'locations', id: locationId, op: 'upsert', row: locationRow(locationId, profileId, admin.id, t1, { working_for_reward_id: null }), client_updated_at: t1 },
      ],
      true,
    );
    const body = expectShape(locked, SyncPushResponseSchema);
    expect(body.rejected).toEqual([]);
    expect(body.applied.sort()).toEqual([ledgerId, locationId].sort());
  });

  it('redeeming a screen-time reward grants its apps time, once per redeem, stacking onto time left', async () => {
    const { admin, profileId } = await setupProfile();
    const rewardId = uuidv7();
    const t0 = Date.now();
    const youtube = 'com.google.android.youtube';
    await pushRequest(app, admin.token, profileId, [
      {
        table: 'rewards',
        id: rewardId,
        op: 'upsert',
        row: {
          id: rewardId, profile_id: profileId, version: 0, client_updated_at: t0, updated_by: admin.id, deleted_at: null,
          name: 'Screen Time - 15 min', emoji: null, photo_id: null, chip_cost: 5, location_id: null, always_available: false, position: 0,
          screen_time_minutes: 15, screen_time_packages: [youtube],
        },
        client_updated_at: t0,
      },
    ]);

    async function allowanceUntil(): Promise<number | undefined> {
      const [row] = await db.select({ settings: profiles.settings }).from(profiles).where(eq(profiles.id, profileId));
      return row!.settings.timed_app_allowances?.find((a) => a.package_name === youtube)?.allowed_until;
    }

    // Redeemed from a locked child device: the lock gate refuses `profiles`, so only the server can grant this.
    const ledgerId = uuidv7();
    const redeem = { table: 'chip_ledger', id: ledgerId, op: 'upsert' as const, row: chipLedgerRow(ledgerId, profileId, admin.id, t0 + 1, { delta: -5, reason: 'redeem', ref_id: rewardId }), client_updated_at: t0 + 1 };
    const before = Date.now();
    await pushRequest(app, admin.token, profileId, [redeem], true);
    const first = await allowanceUntil();
    expect(first).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(first).toBeLessThanOrEqual(Date.now() + 15 * 60_000);

    // A replayed push of the same redeem is a no-op append, so no second grant.
    await pushRequest(app, admin.token, profileId, [redeem]);
    expect(await allowanceUntil()).toBe(first);

    const secondId = uuidv7();
    await pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: secondId, op: 'upsert', row: chipLedgerRow(secondId, profileId, admin.id, t0 + 2, { delta: -5, reason: 'redeem', ref_id: rewardId }), client_updated_at: t0 + 2 },
    ]);
    expect(await allowanceUntil()).toBe(first! + 15 * 60_000);
  });

  it('a whole-phone screen-time reward frees the phone instead of granting apps', async () => {
    const { admin, profileId } = await setupProfile();
    const rewardId = uuidv7();
    const t0 = Date.now();
    await pushRequest(app, admin.token, profileId, [
      {
        table: 'rewards',
        id: rewardId,
        op: 'upsert',
        row: {
          id: rewardId, profile_id: profileId, version: 0, client_updated_at: t0, updated_by: admin.id, deleted_at: null,
          name: 'Free phone', emoji: null, photo_id: null, chip_cost: 5, location_id: null, always_available: false, position: 0,
          screen_time_minutes: 30, screen_time_packages: null, screen_time_whole_phone: true,
        },
        client_updated_at: t0,
      },
    ]);
    const ledgerId = uuidv7();
    const before = Date.now();
    await pushRequest(app, admin.token, profileId, [
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, admin.id, t0 + 1, { delta: -5, reason: 'redeem', ref_id: rewardId }), client_updated_at: t0 + 1 },
    ], true);
    const [row] = await db.select({ settings: profiles.settings }).from(profiles).where(eq(profiles.id, profileId));
    expect(row!.settings.unrestricted_until).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(row!.settings.timed_app_allowances ?? []).toEqual([]);
  });

  it('nextUnrestrictedUntil stacks onto free time still running, else starts from now', () => {
    expect(nextUnrestrictedUntil(null, 15, 1_000)).toBe(1_000 + 15 * 60_000);
    expect(nextUnrestrictedUntil(500, 15, 1_000)).toBe(1_000 + 15 * 60_000);
    expect(nextUnrestrictedUntil(5_000, 15, 1_000)).toBe(5_000 + 15 * 60_000);
  });

  it('nextAllowances drops expired grants and starts a fresh one from now', () => {
    const now = 1_000_000;
    expect(
      nextAllowances(
        [
          { package_name: 'a', allowed_until: now - 1 },
          { package_name: 'b', allowed_until: now + 5 * 60_000 },
        ],
        ['a'],
        10,
        now,
      ),
    ).toEqual([
      { package_name: 'b', allowed_until: now + 5 * 60_000 },
      { package_name: 'a', allowed_until: now + 10 * 60_000 },
    ]);
  });

  it('a locked child cannot pick a different reward when child_picks_reward is off', async () => {
    const { admin, profileId } = await setupProfile();
    await db
      .update(profiles)
      .set({ settings: { child_picks_reward: false, child_redeems: true } })
      .where(eq(profiles.id, profileId));

    const locationId = uuidv7();
    const t0 = Date.now();
    await pushRequest(app, admin.token, profileId, [
      { table: 'locations', id: locationId, op: 'upsert', row: locationRow(locationId, profileId, admin.id, t0, { working_for_reward_id: null }), client_updated_at: t0 },
    ]);

    const t1 = t0 + 1000;
    const locked = await pushRequest(
      app,
      admin.token,
      profileId,
      [{ table: 'locations', id: locationId, op: 'upsert', row: locationRow(locationId, profileId, admin.id, t1, { working_for_reward_id: uuidv7() }), client_updated_at: t1 }],
      true,
    );
    const body = expectShape(locked, SyncPushResponseSchema);
    expect(body.applied).toEqual([]);
    expect(body.rejected[0]).toMatchObject({ id: locationId, table: 'locations', reason: 'locked' });
  });

  it('a locked child device cannot change a location geofence', async () => {
    const { admin, profileId } = await setupProfile();
    const locationId = uuidv7();
    const t0 = Date.now();
    await pushRequest(app, admin.token, profileId, [
      { table: 'locations', id: locationId, op: 'upsert', row: locationRow(locationId, profileId, admin.id, t0), client_updated_at: t0 },
    ]);

    const t1 = t0 + 1000;
    const locked = await pushRequest(
      app,
      admin.token,
      profileId,
      [{ table: 'locations', id: locationId, op: 'upsert', row: locationRow(locationId, profileId, admin.id, t1, { lat: 40.1, lng: -73.2, radius_m: 100 }), client_updated_at: t1 }],
      true,
    );
    const body = expectShape(locked, SyncPushResponseSchema);
    expect(body.applied).toEqual([]);
    expect(body.rejected[0]).toMatchObject({ id: locationId, table: 'locations', reason: 'locked' });
  });

  it('a raw X-Locked header with no server-side lock is ignored (sec-1): the write still applies', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();
    const t0 = Date.now();

    const res = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${admin.token}`, 'x-locked': '1' },
      payload: {
        profile_id: profileId,
        mutations: [
          { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, admin.id, t0), client_updated_at: t0 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = expectShape(res, SyncPushResponseSchema);
    expect(body.applied).toEqual([activityId]);
    expect(body.rejected).toEqual([]);
  });

  it('does not let a client spoof `updated_by` on an upsert or an append-only insert (sec-2)', async () => {
    const { admin, profileId } = await setupProfile();
    const activityId = uuidv7();
    const ledgerId = uuidv7();
    const spoofedId = uuidv7();
    const t0 = Date.now();

    const res = await pushRequest(app, admin.token, profileId, [
      { table: 'activities', id: activityId, op: 'upsert', row: activityRow(activityId, profileId, spoofedId, t0), client_updated_at: t0 },
      { table: 'chip_ledger', id: ledgerId, op: 'upsert', row: chipLedgerRow(ledgerId, profileId, spoofedId, t0), client_updated_at: t0 },
    ]);
    expect(res.statusCode).toBe(200);
    expect(expectShape(res, SyncPushResponseSchema).applied).toEqual([activityId, ledgerId]);

    const pull = await pullRequest(app, admin.token, profileId, 0);
    const body = expectShape(pull, SyncPullResponseSchema);
    expectChangesShape(body.changes);
    expect(body.changes.activities?.find((r) => r.id === activityId)?.updated_by).toBe(admin.id);
    expect(body.changes.chip_ledger?.find((r) => r.id === ledgerId)?.updated_by).toBe(admin.id);
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
    const pushBody = expectShape(push, SyncPushResponseSchema);
    expect(pushBody.applied).toHaveLength(600);
    expect(pushBody.rejected).toEqual([]);

    // The profile's own row is part of the same synced stream (created before any ledger row,
    // so it sorts first) and takes one of the 500 slots on the first page.
    const firstPage = await pullRequest(app, admin.token, profileId, 0);
    const firstBody = expectShape(firstPage, SyncPullResponseSchema);
    expectChangesShape(firstBody.changes);
    const firstPageTotal = Object.values(firstBody.changes).reduce((sum, rows) => sum + rows.length, 0);
    expect(firstPageTotal).toBe(500);
    expect(firstBody.changes.profiles).toHaveLength(1);
    expect(firstBody.changes.chip_ledger).toHaveLength(499);
    expect(firstBody.has_more).toBe(true);

    const secondPage = await pullRequest(app, admin.token, profileId, firstBody.version);
    const secondBody = expectShape(secondPage, SyncPullResponseSchema);
    expectChangesShape(secondBody.changes);
    const secondPageTotal = Object.values(secondBody.changes).reduce((sum, rows) => sum + rows.length, 0);
    expect(secondPageTotal).toBe(101);
    expect(secondBody.changes.chip_ledger).toHaveLength(101);
    expect(secondBody.has_more).toBe(false);
  });
});

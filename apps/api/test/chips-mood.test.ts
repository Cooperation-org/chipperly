import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { ChipLedgerSchema } from '@chipperly/shared/schemas/chips';
import { SyncPullResponseSchema, SyncPushResponseSchema } from '@chipperly/shared/schemas/sync';
import { buildTestApp, expectShape, request } from './helpers.js';
import { setupProfile } from './fixtures.js';

/** Attitude-bonus idea, first slice: chip_ledger.mood_level round-trips through push/pull, nullable. */
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
    delta: 1,
    reason: 'manual',
    ref_id: null,
    created_at: clientUpdatedAt,
    created_by: createdBy,
    ...overrides,
  };
}

describe('chip_ledger mood_level', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('round-trips a chip row with a mood_level set', async () => {
    const { admin, profileId } = await setupProfile();
    const ledgerId = uuidv7();
    const t0 = Date.now();

    const push = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        profile_id: profileId,
        mutations: [
          {
            table: 'chip_ledger',
            id: ledgerId,
            op: 'upsert',
            row: chipLedgerRow(ledgerId, profileId, admin.id, t0, { mood_level: 3 }),
            client_updated_at: t0,
          },
        ],
      },
    });
    expect(push.statusCode).toBe(200);
    const pushBody = expectShape(push, SyncPushResponseSchema);
    expect(pushBody.applied).toEqual([ledgerId]);
    expect(pushBody.rejected).toEqual([]);

    const pull = await request(app, {
      method: 'GET',
      url: `/api/sync/pull?profile_id=${profileId}&since=0`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(pull.statusCode).toBe(200);
    const pullBody = expectShape(pull, SyncPullResponseSchema);
    const [row] = pullBody.changes.chip_ledger ?? [];
    ChipLedgerSchema.parse(row);
    expect(row).toMatchObject({ id: ledgerId, mood_level: 3 });
  });

  it('round-trips null the same as an omitted mood_level', async () => {
    const { admin, profileId } = await setupProfile();
    const ledgerId = uuidv7();
    const t0 = Date.now();

    const push = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        profile_id: profileId,
        mutations: [
          {
            table: 'chip_ledger',
            id: ledgerId,
            op: 'upsert',
            row: chipLedgerRow(ledgerId, profileId, admin.id, t0),
            client_updated_at: t0,
          },
        ],
      },
    });
    expect(push.statusCode).toBe(200);
    expect(expectShape(push, SyncPushResponseSchema).applied).toEqual([ledgerId]);

    const pull = await request(app, {
      method: 'GET',
      url: `/api/sync/pull?profile_id=${profileId}&since=0`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    const pullBody = expectShape(pull, SyncPullResponseSchema);
    const [row] = pullBody.changes.chip_ledger ?? [];
    ChipLedgerSchema.parse(row);
    expect(row).toMatchObject({ id: ledgerId, mood_level: null });
  });
});

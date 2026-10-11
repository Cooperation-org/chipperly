import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MUTATION_TABLE_NAMES, type MutationTable } from '@chipperly/shared/constants/tables';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import type { Mutation } from '@chipperly/shared/schemas/sync';
import type { AdminReplayResult, AdminSyncHealth } from '@chipperly/shared/schemas/syncHealth';
import { sql } from '../db/client.js';
import { syncHealth } from '../lib/syncHealth.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireSuperAdmin } from './admin.js';
import { applyMutation, getRole, type ApplyResult } from './sync.js';

const IdParam = z.object({ id: uuidSchema });

interface StoredRejection {
  id: string;
  user_id: string;
  profile_id: string | null;
  table_name: string;
  row_id: string;
  op: string;
  client_updated_at: string;
  payload: Record<string, unknown> | string | null;
  resolved_at: string | null;
}

/** Super admins: what devices have not managed to save, and putting a refused write back by hand. */
export default async function adminSyncRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireUser, requireSuperAdmin] };

  app.get('/admin/sync-health', guard, async (): Promise<AdminSyncHealth> => syncHealth());

  /** The saved row of one refused write, shown on request rather than in the list. */
  app.get('/admin/sync-rejections/:id', guard, async (request) => {
    const { id } = IdParam.parse(request.params);
    const [row] = await sql<{ payload: unknown }[]>`select payload from sync_rejections where id = ${id}`;
    if (!row) throw new AppError(404, 'not_found', 'No such refused change');
    return { payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload };
  });

  /**
   * Applies a refused write as it was sent, without the child lock or the
   * lapsed-trial pause that refused it. Last-write-wins still holds: if the
   * server has something newer for that row, nothing changes and the
   * refusal is closed as superseded.
   */
  app.post('/admin/sync-rejections/:id/replay', guard, async (request): Promise<AdminReplayResult> => {
    const { id } = IdParam.parse(request.params);
    const [stored] = await sql<StoredRejection[]>`
      select id, user_id, profile_id, table_name, row_id, op, client_updated_at, payload, resolved_at from sync_rejections where id = ${id}`;
    if (!stored) throw new AppError(404, 'not_found', 'No such refused change');
    if (stored.resolved_at !== null) throw new AppError(409, 'already_resolved', 'This one is already dealt with');
    if (!stored.profile_id) throw new AppError(409, 'no_profile', 'This change names no person, so it cannot be applied');
    if (!(MUTATION_TABLE_NAMES as readonly string[]).includes(stored.table_name)) {
      throw new AppError(409, 'unknown_table', 'This change is for a table the server does not sync');
    }
    const payload = (typeof stored.payload === 'string' ? JSON.parse(stored.payload) : stored.payload) as Record<string, unknown> | null;
    const op = stored.op === 'delete' ? 'delete' : 'upsert';
    if (op === 'upsert' && !payload) throw new AppError(409, 'no_payload', 'The row was not kept, so there is nothing to apply');

    const profileId = stored.profile_id;
    const [profile] = await sql`select 1 as x from profiles where id = ${profileId}`;
    if (!profile) throw new AppError(409, 'profile_gone', 'That person no longer exists');

    const mutation: Mutation = {
      table: stored.table_name as MutationTable,
      id: stored.row_id,
      op,
      row: op === 'upsert' ? (payload ?? undefined) : undefined,
      client_updated_at: Number(stored.client_updated_at),
    };
    const role = await getRole(stored.user_id, profileId);

    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${profileId}))`;
      return tx
        .savepoint((sp) => applyMutation(sp, mutation, profileId, stored.user_id, false, role, false))
        .catch((error: unknown): ApplyResult => {
          request.log.error({ err: error, rejectionId: id }, 'replaying a refused write failed');
          return { ok: false, reason: 'invalid', server_row: null };
        });
    });

    const outcome = result.ok ? 'replayed' : result.reason === 'stale' ? 'superseded' : result.reason;
    if (result.ok || result.reason === 'stale') {
      await sql`update sync_rejections set resolved_at = ${Date.now()}, resolution = ${outcome} where id = ${id}`;
    }
    request.log.warn({ rejectionId: id, outcome }, 'admin replayed a refused write');
    return { ok: result.ok || result.reason === 'stale', result: outcome };
  });

  /** Closes a refusal without applying it: it was looked at and needs nothing. */
  app.post('/admin/sync-rejections/:id/dismiss', guard, async (request): Promise<{ ok: true }> => {
    const { id } = IdParam.parse(request.params);
    await sql`update sync_rejections set resolved_at = ${Date.now()}, resolution = 'dismissed' where id = ${id} and resolved_at is null`;
    return { ok: true };
  });
}

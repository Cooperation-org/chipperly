import type { FastifyInstance, FastifyRequest } from 'fastify';
import type postgres from 'postgres';
import type { z } from 'zod';
import { MUTATION_TABLE_NAMES, type MutationTable } from '@chipperly/shared/constants/tables';
import {
  SyncPullQuerySchema,
  SyncPushRequestSchema,
  type Mutation,
  type RejectedMutation,
} from '@chipperly/shared/schemas/sync';
import { LocationSchema } from '@chipperly/shared/schemas/location';
import { ActivitySchema, ActivityStepSchema, RecurrenceSkipSchema } from '@chipperly/shared/schemas/activity';
import { RewardSchema } from '@chipperly/shared/schemas/reward';
import { ScheduleItemSchema, StepCompletionSchema } from '@chipperly/shared/schemas/schedule';
import { ChipLedgerSchema } from '@chipperly/shared/schemas/chips';
import { SocialStorySchema, StoryPageSchema } from '@chipperly/shared/schemas/story';
import { AttitudeCheckSchema } from '@chipperly/shared/schemas/attitude';
import { MoodEventSchema } from '@chipperly/shared/schemas/mood';
import { ProfileSchema } from '@chipperly/shared/schemas/profile';
import { sql } from '../db/client.js';
import { canAccessProfile, canWriteProfile, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

type Sql = postgres.TransactionSql<{}>;
type SyncRow = Record<string, unknown>;

const APPEND_ONLY_TABLES = new Set<MutationTable>(['recurrence_skips', 'step_completions', 'chip_ledger', 'attitude_checks', 'mood_events']);

/** One shared zod schema per pushable table; validates and strips unknown keys before any DB write. */
const TABLE_SCHEMAS: Record<MutationTable, z.ZodType> = {
  locations: LocationSchema,
  activities: ActivitySchema,
  activity_steps: ActivityStepSchema,
  recurrence_skips: RecurrenceSkipSchema,
  rewards: RewardSchema,
  schedule_items: ScheduleItemSchema,
  step_completions: StepCompletionSchema,
  chip_ledger: ChipLedgerSchema,
  social_stories: SocialStorySchema,
  story_pages: StoryPageSchema,
  attitude_checks: AttitudeCheckSchema,
  mood_events: MoodEventSchema,
  profiles: ProfileSchema,
};

/**
 * postgres.js reads `bigint` columns back as strings by default (no
 * `mode: 'number'` at this raw-SQL layer). These are the columns that are
 * `bigint` somewhere in the schema; converting by name is safe because the
 * name is unambiguous across tables (see db/schema/*.ts).
 */
const BIGINT_FIELDS = ['version', 'client_updated_at', 'deleted_at', 'created_at', 'completed_at'] as const;

function normalizeRow(row: postgres.Row): SyncRow {
  const out: SyncRow = { ...row };
  for (const field of BIGINT_FIELDS) {
    const value = out[field];
    if (value !== null && value !== undefined) {
      out[field] = Number(value);
    }
  }
  return out;
}

export default async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sync/pull', { preHandler: requireUser }, async (request: FastifyRequest) => {
    const user = request.user;
    if (!user) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const query = SyncPullQuerySchema.parse(request.query);

    const allowed = await canAccessProfile(user.id, query.profile_id);
    if (!allowed) throw new AppError(403, 'forbidden', 'Cannot read this profile');

    const collected: Array<{ table: MutationTable; row: SyncRow }> = [];
    for (const table of MUTATION_TABLE_NAMES) {
      const idColumn = table === 'profiles' ? 'id' : 'profile_id';
      // eslint-disable-next-line no-await-in-loop -- 12 small sequential queries; not worth parallelizing at this scale.
      const rows = await sql`
        select * from ${sql(table)}
        where ${sql(idColumn)} = ${query.profile_id} and version > ${query.since}
        order by version asc
        limit 501
      `;
      for (const row of rows) collected.push({ table, row: normalizeRow(row) });
    }

    collected.sort((a, b) => (a.row.version as number) - (b.row.version as number));
    const has_more = collected.length > 500;
    const page = collected.slice(0, 500);

    const changes: Record<string, SyncRow[]> = {};
    for (const table of MUTATION_TABLE_NAMES) changes[table] = [];
    for (const item of page) (changes[item.table] as SyncRow[]).push(item.row);

    const version = page.length > 0 ? Math.max(...page.map((item) => item.row.version as number)) : query.since;

    return { changes, version, has_more };
  });

  app.post('/sync/push', { preHandler: requireUser }, async (request: FastifyRequest) => {
    const user = request.user;
    if (!user) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const body = SyncPushRequestSchema.parse(request.body);

    const allowed = await canWriteProfile(user.id, body.profile_id);
    if (!allowed) throw new AppError(403, 'forbidden', 'Cannot write to this profile');

    // Whole-request 400: every mutation must target exactly the profile named in the body.
    for (const mutation of body.mutations) {
      if (mutation.table === 'profiles') {
        if (mutation.id !== body.profile_id) {
          throw new AppError(400, 'profile_mismatch', `mutation ${mutation.id} targets a different profile`);
        }
      } else if (mutation.row && typeof mutation.row.profile_id === 'string' && mutation.row.profile_id !== body.profile_id) {
        throw new AppError(400, 'profile_mismatch', `mutation ${mutation.id} targets a different profile`);
      }
    }

    const role = await getRole(user.id, body.profile_id);

    const applied: string[] = [];
    const rejected: RejectedMutation[] = [];

    await sql.begin(async (tx) => {
      // Serializes concurrent /sync/push calls for the same profile so the
      // BEFORE-trigger version assignment below can't commit out of order
      // (a slower tx grabbing a lower version than one that already
      // committed and got read as a pull cursor) and get permanently
      // skipped by that cursor.
      await tx`select pg_advisory_xact_lock(hashtext(${body.profile_id}))`;
      for (const mutation of body.mutations) {
        // Each mutation runs in its own savepoint: a DB-level error (a bad
        // value, a constraint violation, anything applyMutation's own zod
        // checks didn't catch) rolls back only that mutation instead of
        // aborting the whole push transaction and 500ing the request.
        // eslint-disable-next-line no-await-in-loop -- mutations must apply in outbox order, one transaction.
        const result = await tx
          .savepoint((sp) => applyMutation(sp, mutation, body.profile_id, user.id, request.locked, role))
          .catch((error: unknown) => {
            request.log.error({ err: error, mutationId: mutation.id, table: mutation.table }, 'sync mutation failed');
            const failed: ApplyResult = { ok: false, reason: 'invalid', server_row: null };
            return failed;
          });
        if (result.ok) {
          applied.push(mutation.id);
        } else {
          rejected.push({ id: mutation.id, table: mutation.table, reason: result.reason, server_row: result.server_row });
        }
      }
    });

    const [{ last_value }] = await sql`select last_value from sync_version_seq`;

    return { applied, rejected, version: Number(last_value) };
  });
}

/** Admin of the profile's account, or a member with no role at all (not a member/admin) -> null. */
async function getRole(userId: string, profileId: string): Promise<'admin' | 'member' | null> {
  const [row] = await sql`
    select m.role from account_members m
    join profiles p on p.account_id = m.account_id
    where p.id = ${profileId} and m.user_id = ${userId}
    limit 1
  `;
  return (row?.role as 'admin' | 'member' | undefined) ?? null;
}

type RejectReason = 'stale' | 'locked' | 'forbidden' | 'invalid';
type ApplyResult = { ok: true } | { ok: false; reason: RejectReason; server_row: SyncRow | null };

async function applyMutation(
  tx: Sql,
  mutation: Mutation,
  profileId: string,
  userId: string,
  locked: boolean,
  role: 'admin' | 'member' | null,
): Promise<ApplyResult> {
  const { table } = mutation;

  if (locked) {
    const allowed = await lockGateAllows(tx, mutation);
    if (!allowed) return { ok: false, reason: 'locked', server_row: null };
  }

  if (APPEND_ONLY_TABLES.has(table)) {
    return applyAppendOnly(tx, mutation, userId);
  }

  if (mutation.op === 'delete') {
    return applyDelete(tx, mutation, userId);
  }

  return applyUpsert(tx, mutation, profileId, userId, role);
}

/** schedule_items / step_completions / attitude_checks / chip_ledger rules from CONTRACTS.md "Sync authorization". */
async function lockGateAllows(tx: Sql, mutation: Mutation): Promise<boolean> {
  switch (mutation.table) {
    case 'schedule_items': {
      if (mutation.op !== 'upsert' || !mutation.row) return false;
      const parsed = ScheduleItemSchema.safeParse(mutation.row);
      if (!parsed.success) return false;
      const [stored] = await tx`select * from schedule_items where id = ${mutation.id} limit 1`;
      if (!stored) return false;
      const storedRow = normalizeRow(stored);
      const contentKeys = ['date', 'position', 'activity_id', 'start_time', 'part_of_day', 'source', 'deleted_at'] as const;
      return contentKeys.every((key) => (parsed.data as SyncRow)[key] === storedRow[key]);
    }
    // step_completions is un-completed by soft-delete (schemas/schedule.ts
    // StepCompletionSchema docstring), so a locked device must be able to
    // push that delete, not only the upsert that completes a step.
    case 'step_completions':
      return mutation.op === 'delete' || (mutation.op === 'upsert' && Boolean(mutation.row));
    case 'attitude_checks':
    case 'mood_events':
      return mutation.op === 'upsert' && Boolean(mutation.row);
    case 'chip_ledger': {
      if (mutation.op !== 'upsert' || !mutation.row) return false;
      return mutation.row.reason === 'task' || mutation.row.reason === 'step';
    }
    default:
      return false;
  }
}

async function applyAppendOnly(tx: Sql, mutation: Mutation, userId: string): Promise<ApplyResult> {
  // Append-only rows are never updated once written, but one of them
  // (step_completions) IS soft-deleted client-side to un-complete a step
  // (schemas/schedule.ts), so a `delete` mutation must actually apply,
  // same as any other table's soft-delete.
  if (mutation.op === 'delete') return applyDelete(tx, mutation, userId);
  if (!mutation.row) return { ok: true };

  const schema = TABLE_SCHEMAS[mutation.table];
  const parsed = schema.safeParse(mutation.row);
  if (!parsed.success) return { ok: false, reason: 'invalid', server_row: null };
  // `updated_by` is server-controlled like `version` (the sync trigger
  // handles that one); never trust the client-supplied uuid here, same as
  // applyDelete and applyUpsert below.
  const row: SyncRow = { ...(parsed.data as SyncRow), id: mutation.id, updated_by: userId };

  await tx`insert into ${tx(mutation.table)} ${tx(row)} on conflict (id) do nothing`;
  return { ok: true };
}

async function applyDelete(tx: Sql, mutation: Mutation, userId: string): Promise<ApplyResult> {
  const stored = await selectForUpdate(tx, mutation.table, mutation.id);
  if (!stored) return { ok: true }; // nothing to delete

  if (mutation.client_updated_at < (stored.client_updated_at as number)) {
    return { ok: false, reason: 'stale', server_row: stored };
  }

  await tx`
    update ${tx(mutation.table)}
    set deleted_at = ${Date.now()}, client_updated_at = ${mutation.client_updated_at}, updated_by = ${userId}
    where id = ${mutation.id}
  `;
  return { ok: true };
}

async function applyUpsert(
  tx: Sql,
  mutation: Mutation,
  profileId: string,
  userId: string,
  role: 'admin' | 'member' | null,
): Promise<ApplyResult> {
  if (!mutation.row) return { ok: false, reason: 'invalid', server_row: null };

  const schema = TABLE_SCHEMAS[mutation.table];
  const parsed = schema.safeParse(mutation.row);
  if (!parsed.success) return { ok: false, reason: 'invalid', server_row: null };

  // `updated_by` is server-controlled like `version`; never trust the
  // client-supplied uuid, same as applyDelete/applyAppendOnly.
  const row: SyncRow = { ...(parsed.data as SyncRow), id: mutation.id, updated_by: userId };
  if (mutation.table !== 'profiles') row.profile_id = profileId;
  // `profiles.settings` is the only jsonb column any pushed table has, and
  // it needs to be pre-serialized here: db/client.ts's `drizzle(sql)` call
  // replaces this shared connection's jsonb serializer with a passthrough
  // (drizzle does its own `JSON.stringify` before handing postgres.js a
  // value), so a plain object reaches the wire as `[object Object]` /
  // throws, and `sql.json()` doesn't help either since it hits that same
  // passthrough. Stringifying ourselves is what the passthrough expects.
  if (mutation.table === 'profiles' && 'settings' in row) {
    row.settings = JSON.stringify(row.settings);
  }

  const stored = await selectForUpdate(tx, mutation.table, mutation.id);

  if (mutation.table === 'profiles') {
    const incomingShareToken = row.share_token ?? null;
    const storedShareToken = stored ? (stored.share_token ?? null) : null;
    if (incomingShareToken !== storedShareToken && role !== 'admin') {
      return { ok: false, reason: 'forbidden', server_row: stored };
    }
  }

  if (!stored) {
    await tx`insert into ${tx(mutation.table)} ${tx(row)}`;
    return { ok: true };
  }

  if (mutation.client_updated_at < (stored.client_updated_at as number)) {
    return { ok: false, reason: 'stale', server_row: stored };
  }

  const updateRow: SyncRow = { ...row };
  delete updateRow.id;
  if (mutation.table === 'profiles') {
    delete updateRow.account_id;
  } else {
    delete updateRow.profile_id;
  }

  await tx`update ${tx(mutation.table)} set ${tx(updateRow)} where id = ${mutation.id}`;
  return { ok: true };
}

async function selectForUpdate(tx: Sql, table: MutationTable, id: string): Promise<SyncRow | null> {
  const rows = table === 'profiles' ? await tx`select * from profiles where id = ${id} for update` : await tx`select * from ${tx(table)} where id = ${id} for update`;
  return rows[0] ? normalizeRow(rows[0]) : null;
}

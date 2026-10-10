import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { TABLE_NAMES } from '@chipperly/shared/constants/tables';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { setupProfile, createUser, type TestProfileSetup } from './fixtures.js';
import { db, sql } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { rewards } from '../src/db/schema/rewards.js';
import { locations } from '../src/db/schema/locations.js';
import { env } from '../src/env.js';
import { countBackupRows, parseCopyHeader, previewAccountRestore, restoreAccount, type BackupSource } from '../src/lib/backups.js';
import { setBackupSourceForTests } from '../src/routes/adminBackups.js';

const DAY = '2026-10-01';

/**
 * Stands in for the nightly dump: the tables as they are at the moment it is taken, kept as the
 * same COPY text pg_restore prints. Everything after the file read is the real code on a real database.
 */
async function takeBackup(): Promise<BackupSource & { copies: number }> {
  const tables = new Map<string, string[]>();
  // Only what the restore reads: the suite's shared database is large by the time this runs.
  const names = ['users', 'accounts', 'account_members', 'profiles', ...TABLE_NAMES];
  for (const table of names) {
    const columns = (await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table} order by ordinal_position`).map((r) => r.column_name);
    const readable = await sql`copy (select ${sql(columns)} from ${sql(table)}) to stdout`.readable();
    let text = '';
    for await (const chunk of readable) text += (chunk as Buffer).toString('utf8');
    const rows = text.split('\n').filter((line) => line !== '');
    tables.set(table, ['--', `COPY public.${table} (${columns.join(', ')}) FROM stdin;`, ...rows, '\\.', '']);
  }
  const source = {
    copies: 0,
    list: async () => [{ date: DAY, taken_at: Date.now(), size_bytes: 1 }],
    async *tableLines(date: string, table: string) {
      if (date !== DAY) throw new Error('no such backup');
      for (const line of tables.get(table) ?? []) yield line;
    },
    async safetyCopy() {
      source.copies += 1;
      return 'pre-restore-test.dump';
    },
  };
  return source;
}

async function addReward(setup: TestProfileSetup, name: string, at = Date.now()): Promise<string> {
  const id = uuidv7();
  await db.insert(rewards).values({ id, profile_id: setup.profileId, client_updated_at: at, updated_by: setup.admin.id, deleted_at: null, name, emoji: '🎁', chip_cost: 5, location_ids: [], always_available: false, position: 0 });
  return id;
}
const rewardRow = async (id: string) => (await db.select().from(rewards).where(eq(rewards.id, id)))[0];
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const emailOf = async (userId: string) => (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)))[0]!.email;

describe('parseCopyHeader', () => {
  it('reads the columns, quoted or not, and refuses anything that is not a plain column list', () => {
    expect(parseCopyHeader('COPY public.rewards (id, profile_id, "name") FROM stdin;')).toEqual(['id', 'profile_id', 'name']);
    expect(parseCopyHeader('COPY rewards (id) FROM stdin;')).toEqual(['id']);
    expect(parseCopyHeader('SET statement_timeout = 0;')).toBeNull();
    expect(parseCopyHeader('COPY public.rewards (id, name); drop table users; --) FROM stdin;')).toBeNull();
  });
});

describe('restoring one account from a backup', () => {
  it('previews exactly what would come back, then brings it back and leaves newer work alone', async () => {
    const setup = await setupProfile();
    const other = await setupProfile();
    const kept = await addReward(setup, 'Movie night');
    const edited = await addReward(setup, 'Swimming');
    const removed = await addReward(setup, 'Horse lesson');
    const gone = await addReward(setup, 'Pizza');
    const theirs = await addReward(other, 'Someone else');
    const place = uuidv7();
    await db.insert(locations).values({ id: place, profile_id: setup.profileId, client_updated_at: 1, updated_by: setup.admin.id, deleted_at: null, name: 'Home', position: 0 });

    const backup = await takeBackup();
    expect(await countBackupRows(backup, DAY, 'rewards')).toBeGreaterThanOrEqual(5);

    // After the backup: one edited, one deleted in the app (marked), one wiped outright, one new, and the neighbours edit theirs.
    await db.update(rewards).set({ name: 'Swimming pool', chip_cost: 9, client_updated_at: Date.now() }).where(eq(rewards.id, edited));
    await db.update(rewards).set({ deleted_at: Date.now(), client_updated_at: Date.now() }).where(eq(rewards.id, removed));
    await db.delete(rewards).where(eq(rewards.id, gone));
    const added = await addReward(setup, 'Made after the backup');
    await db.update(rewards).set({ name: 'Changed by the neighbours' }).where(eq(rewards.id, theirs));
    const versionBefore = (await rewardRow(kept))!.version;

    const preview = await previewAccountRestore(backup, DAY, setup.accountId);
    expect(preview.account).toMatchObject({ id: setup.accountId, exists_now: true, admins: [await emailOf(setup.admin.id)] });
    expect(preview.tables.find((t) => t.table === 'rewards')).toEqual({ table: 'rewards', in_backup: 4, live: 3, missing: 2, changed: 1, same: 1, newer: 1 });
    expect(preview.tables.find((t) => t.table === 'locations')).toMatchObject({ in_backup: 1, missing: 0, changed: 0, same: 1 });
    expect(preview.will_restore).toBe(3);
    const named = Object.fromEntries(preview.items.filter((i) => i.table === 'rewards').map((i) => [i.name, i.status]));
    expect(named).toEqual({ 'Movie night': 'same', Swimming: 'changed', 'Horse lesson': 'missing', Pizza: 'missing' });
    // A preview changes nothing.
    expect((await rewardRow(edited))!.name).toBe('Swimming pool');

    const before = Date.now();
    const result = await restoreAccount(backup, DAY, setup.accountId, setup.admin.id);
    expect(result.total).toBe(3);
    expect(result.restored).toEqual([{ table: 'rewards', rows: 3 }]);
    expect(backup.copies).toBe(1);

    expect(await rewardRow(edited)).toMatchObject({ name: 'Swimming', chip_cost: 5, deleted_at: null, location_ids: [] });
    expect(await rewardRow(removed)).toMatchObject({ name: 'Horse lesson', deleted_at: null });
    expect(await rewardRow(gone)).toMatchObject({ name: 'Pizza', deleted_at: null });
    // Stamped as changed now, with a new version, so devices take the restored copy.
    expect((await rewardRow(edited))!.client_updated_at).toBeGreaterThanOrEqual(before);
    expect((await rewardRow(edited))!.version).toBeGreaterThan(versionBefore);
    // Untouched: what was already the same, what was made since, and every other account.
    expect((await rewardRow(kept))!.version).toBe(versionBefore);
    expect(await rewardRow(added)).toMatchObject({ name: 'Made after the backup', deleted_at: null });
    expect((await rewardRow(theirs))!.name).toBe('Changed by the neighbours');

    // Running it again finds nothing left to do.
    expect((await previewAccountRestore(backup, DAY, setup.accountId)).will_restore).toBe(0);
    expect((await restoreAccount(backup, DAY, setup.accountId, setup.admin.id)).total).toBe(0);
  });

  it('does not bring back something that was already deleted when the backup was taken', async () => {
    const setup = await setupProfile();
    const dead = await addReward(setup, 'Deleted long ago');
    await db.update(rewards).set({ deleted_at: 5 }).where(eq(rewards.id, dead));
    const backup = await takeBackup();
    await db.update(rewards).set({ deleted_at: null, name: 'Brought back by hand since' }).where(eq(rewards.id, dead));
    expect((await previewAccountRestore(backup, DAY, setup.accountId)).will_restore).toBe(0);
    await restoreAccount(backup, DAY, setup.accountId, setup.admin.id);
    expect(await rewardRow(dead)).toMatchObject({ name: 'Brought back by hand since', deleted_at: null });
  });
});

describe('the backup screen routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    setBackupSourceForTests(null);
    await app.close();
  });

  it('is for super admins only, and says so plainly when the server keeps no backups', async () => {
    const boss = await createUser('backup boss');
    const someone = await createUser('not an admin');
    expect((await request(app, { method: 'GET', url: '/api/admin/backups', headers: auth(someone.token) })).statusCode).toBe(403);
    env.superAdminEmails.add(await emailOf(boss.id));
    expect((await request(app, { method: 'GET', url: '/api/admin/backups', headers: auth(boss.token) })).json()).toEqual({ enabled: false, backups: [] });
    expect((await request(app, { method: 'GET', url: `/api/admin/backups/${DAY}/summary`, headers: auth(boss.token) })).statusCode).toBe(404);
  });

  it('lists, searches, previews and restores, and refuses a restore without the account name', async () => {
    const boss = await createUser('backup boss 2');
    env.superAdminEmails.add(await emailOf(boss.id));
    const setup = await setupProfile();
    const lost = await addReward(setup, 'Lost reward');
    setBackupSourceForTests(await takeBackup());
    await db.delete(rewards).where(eq(rewards.id, lost));
    const headers = auth(boss.token);

    expect((await request(app, { method: 'GET', url: '/api/admin/backups', headers })).json()).toMatchObject({ enabled: true, backups: [{ date: DAY }] });
    const found = (await request(app, { method: 'GET', url: `/api/admin/backups/${DAY}/accounts?q=${encodeURIComponent(await emailOf(setup.admin.id))}`, headers })).json() as { accounts: { id: string }[] };
    expect(found.accounts.map((a) => a.id)).toEqual([setup.accountId]);
    const preview = (await request(app, { method: 'GET', url: `/api/admin/backups/${DAY}/accounts/${setup.accountId}`, headers })).json() as { will_restore: number; account: { name: string } };
    expect(preview.will_restore).toBe(1);

    const url = `/api/admin/backups/${DAY}/accounts/${setup.accountId}/restore`;
    expect((await request(app, { method: 'POST', url, headers, payload: { confirm: 'wrong name' } })).statusCode).toBe(400);
    expect(await rewardRow(lost)).toBeUndefined();
    const done = await request(app, { method: 'POST', url, headers, payload: { confirm: preview.account.name } });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ total: 1 });
    expect(await rewardRow(lost)).toMatchObject({ name: 'Lost reward' });

    const summary = (await request(app, { method: 'GET', url: `/api/admin/backups/${DAY}/summary`, headers })).json() as { tables: { table: string; in_backup: number; live: number }[] };
    expect(summary.tables.find((t) => t.table === 'rewards')!.in_backup).toBeGreaterThan(0);
    // No script on this server: the whole-database restore stays shut.
    expect((await request(app, { method: 'POST', url: `/api/admin/backups/${DAY}/restore-all`, headers, payload: { confirm: `RESTORE ${DAY}` } })).statusCode).toBe(404);
  });
});

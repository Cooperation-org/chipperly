import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TransactionSql } from 'postgres';
import { TABLE_NAMES } from '@chipperly/shared/constants/tables';
import type { BackupAccount, BackupAccountPreview, BackupFile, BackupSummary, BackupTableDiff, RestoreAccountResult, RestoreStatus } from '@chipperly/shared/schemas/backup';
import { sql } from '../db/client.js';
import { AppError } from '../plugins/errors.js';

// Restoring from the nightly backups (deploy/contabo/backup.sh), for the super admin screen.
//
// A backup is read without restoring it anywhere: `pg_restore --data-only --table=x` prints the
// table as a COPY block, and that block is loaded into a temporary table that lives for one
// transaction. Previewing and restoring one account are then plain SQL between the temporary
// tables and the live ones, so no second database and no extra database rights are needed.

/** Where backups come from. The real one reads files with pg_restore; tests hand in their own. */
export interface BackupSource {
  list(): Promise<BackupFile[]>;
  /** The lines `pg_restore --data-only --table=<table>` prints: a `COPY ... FROM stdin;` line, the rows, then `\.`. */
  tableLines(date: string, table: string): AsyncIterable<string>;
  /** Copies the live database to a file before a restore changes it, and returns the file's name. */
  safetyCopy(): Promise<string>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IDENT = /^[a-z_][a-z0-9_]*$/;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 300)}`))));
  });
}

export function fileBackupSource(dir: string, databaseUrl: string): BackupSource {
  const fileFor = (date: string): string => {
    if (!DATE.test(date)) throw new AppError(400, 'bad_date', 'Not a backup date');
    return path.join(dir, `db-${date}.dump`);
  };
  return {
    async list() {
      const names = await fs.readdir(dir).catch(() => [] as string[]);
      const out: BackupFile[] = [];
      for (const name of names) {
        const match = /^db-(\d{4}-\d{2}-\d{2})\.dump$/.exec(name);
        if (!match?.[1]) continue;
        const stat = await fs.stat(path.join(dir, name));
        out.push({ date: match[1], taken_at: Math.round(stat.mtimeMs), size_bytes: stat.size });
      }
      return out.sort((a, b) => b.date.localeCompare(a.date));
    },
    async *tableLines(date, table) {
      if (!IDENT.test(table)) throw new AppError(400, 'bad_table', 'Not a table name');
      const file = fileFor(date);
      await fs.access(file).catch(() => {
        throw new AppError(404, 'not_found', 'No backup for that day');
      });
      const child = spawn('pg_restore', ['--data-only', `--table=${table}`, '--file=-', file], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      const closed = new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) yield line;
      const code = await closed;
      if (code !== 0) throw new Error(`pg_restore exited ${code}: ${stderr.slice(0, 300)}`);
    },
    async safetyCopy() {
      const name = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
      await run('pg_dump', ['--format=custom', `--file=${path.join(dir, name)}`, databaseUrl]);
      return name;
    },
  };
}

/** `COPY public.activities (id, profile_id, "name") FROM stdin;` -> the table's columns as they were in the backup. */
export function parseCopyHeader(line: string): string[] | null {
  const match = /^COPY (?:public\.)?"?[a-z_][a-z0-9_]*"? \((.+)\) FROM stdin;$/.exec(line);
  if (!match?.[1]) return null;
  const columns = match[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  return columns.every((c) => IDENT.test(c)) ? columns : null;
}

/** How many rows a table has in a backup, without loading it. */
export async function countBackupRows(source: BackupSource, date: string, table: string): Promise<number> {
  let inData = false;
  let rows = 0;
  for await (const line of source.tableLines(date, table)) {
    if (!inData) inData = parseCopyHeader(line) !== null;
    else if (line === '\\.') inData = false;
    else rows += 1;
  }
  return rows;
}

type Tx = TransactionSql;

async function liveColumns(tx: Tx, table: string): Promise<string[]> {
  const rows = await tx<{ column_name: string }[]>`
    select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table} order by ordinal_position`;
  return rows.map((r) => r.column_name);
}

const tempName = (table: string): string => `bk_${table}`;

/**
 * Loads one table of a backup into a temporary table shaped like the live one (gone when the
 * transaction ends). Returns the columns the backup had: a column added since is absent here and is
 * left alone by everything below. A table the backup does not have comes back with no columns.
 * With `onlyProfiles`, rows of other profiles are skipped as they stream past, so previewing one
 * account costs what that account holds, not what the whole database holds.
 */
export async function loadBackupTable(tx: Tx, source: BackupSource, date: string, table: string, onlyProfiles?: ReadonlySet<string>): Promise<string[]> {
  if (!IDENT.test(table)) throw new AppError(400, 'bad_table', 'Not a table name');
  await tx`create temp table ${tx(tempName(table))} (like ${tx(table)} including defaults) on commit drop`;
  const lines = source.tableLines(date, table)[Symbol.asyncIterator]();
  let columns: string[] | null = null;
  for (let next = await lines.next(); !next.done; next = await lines.next()) {
    columns = parseCopyHeader(next.value);
    if (columns) break;
  }
  if (!columns) return [];
  const known = new Set(await liveColumns(tx, table));
  // A column the live table no longer has cannot be loaded; refuse rather than shift the others across.
  const dropped = columns.filter((c) => !known.has(c));
  if (dropped.length > 0) throw new AppError(409, 'schema_changed', `The backup has columns the app no longer has (${table}: ${dropped.join(', ')})`);

  // COPY text is tab-separated and escapes a tab inside a value, so splitting on tabs finds the column.
  const profileAt = onlyProfiles ? columns.indexOf('profile_id') : -1;
  async function* rows(): AsyncGenerator<string> {
    for (let next = await lines.next(); !next.done; next = await lines.next()) {
      if (next.value === '\\.') break;
      if (profileAt >= 0 && !onlyProfiles?.has(next.value.split('\t')[profileAt] ?? '')) continue;
      yield `${next.value}\n`;
    }
    // Drain what pg_restore prints after the data, so the process can finish.
    for (let next = await lines.next(); !next.done; next = await lines.next()) void next;
  }
  const writable = await tx`copy ${tx(tempName(table))} (${tx(columns)}) from stdin`.writable();
  await pipeline(Readable.from(rows()), writable);
  return columns;
}

const EVERY_TABLE = ['profiles', ...TABLE_NAMES] as const;
/** The column that names a thing, for the tables whose rows a person would recognise. */
const NAME_COLUMN: Record<string, string> = { profiles: 'name', locations: 'name', activities: 'name', rewards: 'name', social_stories: 'title' };
/** Never part of "is this row the same": the server sets them, and a restore sets them again. */
const BOOKKEEPING = ['version', 'client_updated_at', 'updated_by'];

async function loadPeopleTables(tx: Tx, source: BackupSource, date: string): Promise<void> {
  for (const table of ['users', 'accounts', 'account_members', 'profiles']) await loadBackupTable(tx, source, date, table);
  // Temporary tables start with no indexes and no statistics: without these, finding an account's
  // admins and people compares every account with every member.
  await tx`create index on bk_users (id)`;
  await tx`create index on bk_account_members (account_id)`;
  await tx`create index on bk_profiles (account_id)`;
  await tx`analyze bk_users, bk_accounts, bk_account_members, bk_profiles`;
}

const accountRow = (r: { id: string; name: string; kind: string; admins: string[] | null; people: string[] | null; exists_now: boolean }): BackupAccount => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  admins: r.admins ?? [],
  people: r.people ?? [],
  exists_now: r.exists_now,
});

async function backupAccounts(tx: Tx, where: { q?: string; id?: string }): Promise<BackupAccount[]> {
  const like = `%${(where.q ?? '').toLowerCase()}%`;
  const rows = await tx<{ id: string; name: string; kind: string; admins: string[] | null; people: string[] | null; exists_now: boolean }[]>`
    select a.id, a.name, a.kind,
      (select array_agg(u.email order by u.email) from bk_account_members m join bk_users u on u.id = m.user_id where m.account_id = a.id and m.role = 'admin') as admins,
      (select array_agg(p.name order by p.name) from bk_profiles p where p.account_id = a.id and p.deleted_at is null) as people,
      exists (select 1 from accounts l where l.id = a.id) as exists_now
    from bk_accounts a
    where ${where.id ? tx`a.id = ${where.id}` : tx`(
      lower(a.name) like ${like}
      or exists (select 1 from bk_account_members m join bk_users u on u.id = m.user_id where m.account_id = a.id and lower(u.email) like ${like})
      or exists (select 1 from bk_profiles p where p.account_id = a.id and lower(p.name) like ${like})
    )`}
    order by a.created_at desc
    limit 100`;
  return rows.map(accountRow);
}

/** Accounts as they were in a backup, searched by account name, admin email or a person's name. */
export function searchBackupAccounts(source: BackupSource, date: string, q: string): Promise<BackupAccount[]> {
  return sql.begin(async (tx) => {
    await loadPeopleTables(tx, source, date);
    return backupAccounts(tx, { q });
  }) as Promise<BackupAccount[]>;
}

interface TablePlan {
  table: string;
  /** Columns present in both the backup and the live table. */
  common: string[];
  /** Columns left out when deciding whether a row changed. */
  ignore: string[];
}

/** Loads every content table for one account and works out which columns can be compared and written. */
async function planAccount(tx: Tx, source: BackupSource, date: string, accountId: string): Promise<{ account: BackupAccount; plans: TablePlan[] }> {
  await loadPeopleTables(tx, source, date);
  const [account] = await backupAccounts(tx, { id: accountId });
  if (!account) throw new AppError(404, 'not_found', 'That account is not in this backup');
  const profileIds = new Set((await tx<{ id: string }[]>`select id from bk_profiles where account_id = ${accountId}`).map((p) => p.id));
  const plans: TablePlan[] = [];
  for (const table of EVERY_TABLE) {
    const backupColumns = table === 'profiles' ? await backupColumnsOf(tx, source, date, table) : await loadBackupTable(tx, source, date, table, profileIds);
    const live = await liveColumns(tx, table);
    const had = new Set(backupColumns);
    plans.push({ table, common: live.filter((c) => had.has(c)), ignore: [...BOOKKEEPING, ...live.filter((c) => !had.has(c))] });
  }
  return { account, plans };
}

/** `profiles` is already loaded with the people tables; its columns are read from the backup's header again. */
async function backupColumnsOf(_tx: Tx, source: BackupSource, date: string, table: string): Promise<string[]> {
  for await (const line of source.tableLines(date, table)) {
    const columns = parseCopyHeader(line);
    if (columns) return columns;
  }
  return [];
}

/** Rows of this account: the profiles themselves by account, everything else by its profiles. */
const scope = (tx: Tx, table: string, alias: string, accountId: string) =>
  table === 'profiles'
    ? tx`${tx(alias)}.account_id = ${accountId}`
    : tx`${tx(alias)}.profile_id in (select id from bk_profiles where account_id = ${accountId})`;

/**
 * A backup row is `same` when the live row holds the same content, `missing` when the live row is gone
 * or deleted, `changed` otherwise. A row that was already deleted in the backup is never restored:
 * a restore brings things back, it does not delete.
 */
const sameAs = (tx: Tx, ignore: string[]) => tx`(l.id is not null and l.deleted_at is null and (to_jsonb(l) - ${ignore}::text[]) = (to_jsonb(b) - ${ignore}::text[]))`;

async function diffTable(tx: Tx, plan: TablePlan, accountId: string): Promise<BackupTableDiff> {
  const { table, ignore } = plan;
  const [row] = await tx<{ in_backup: number; live: number; missing: number; changed: number; same: number; newer: number }[]>`
    select
      (select count(*)::int from ${tx(tempName(table))} b where ${scope(tx, table, 'b', accountId)} and b.deleted_at is null) as in_backup,
      (select count(*)::int from ${tx(table)} l where ${scope(tx, table, 'l', accountId)} and l.deleted_at is null) as live,
      (select count(*)::int from ${tx(tempName(table))} b left join ${tx(table)} l on l.id = b.id
         where ${scope(tx, table, 'b', accountId)} and b.deleted_at is null and (l.id is null or l.deleted_at is not null)) as missing,
      (select count(*)::int from ${tx(tempName(table))} b join ${tx(table)} l on l.id = b.id
         where ${scope(tx, table, 'b', accountId)} and b.deleted_at is null and l.deleted_at is null and not ${sameAs(tx, ignore)}) as changed,
      (select count(*)::int from ${tx(tempName(table))} b join ${tx(table)} l on l.id = b.id
         where ${scope(tx, table, 'b', accountId)} and b.deleted_at is null and ${sameAs(tx, ignore)}) as same,
      (select count(*)::int from ${tx(table)} l where ${scope(tx, table, 'l', accountId)} and l.deleted_at is null
         and not exists (select 1 from ${tx(tempName(table))} b where b.id = l.id)) as newer`;
  return { table, in_backup: row?.in_backup ?? 0, live: row?.live ?? 0, missing: row?.missing ?? 0, changed: row?.changed ?? 0, same: row?.same ?? 0, newer: row?.newer ?? 0 };
}

/** What a restore of one account from one day would do, row counts and names, changing nothing. */
export function previewAccountRestore(source: BackupSource, date: string, accountId: string): Promise<BackupAccountPreview> {
  return sql.begin(async (tx) => {
    const { account, plans } = await planAccount(tx, source, date, accountId);
    const tables: BackupTableDiff[] = [];
    const items: BackupAccountPreview['items'] = [];
    for (const plan of plans) {
      tables.push(await diffTable(tx, plan, accountId));
      const nameColumn = NAME_COLUMN[plan.table];
      if (!nameColumn || !plan.common.includes(nameColumn)) continue;
      const person = plan.table === 'profiles' ? tx`b.name` : tx`(select p.name from bk_profiles p where p.id = b.profile_id)`;
      const named = await tx<{ name: string; person: string | null; status: 'missing' | 'changed' | 'same' }[]>`
        select b.${tx(nameColumn)} as name, ${person} as person,
          case when l.id is null or l.deleted_at is not null then 'missing' when ${sameAs(tx, plan.ignore)} then 'same' else 'changed' end as status
        from ${tx(tempName(plan.table))} b left join ${tx(plan.table)} l on l.id = b.id
        where ${scope(tx, plan.table, 'b', accountId)} and b.deleted_at is null
        order by 2, 1
        limit 500`;
      for (const n of named) items.push({ table: plan.table, person: n.person ?? '', name: n.name, status: n.status });
    }
    return { date, account, tables, will_restore: tables.reduce((sum, t) => sum + t.missing + t.changed, 0), items };
  }) as Promise<BackupAccountPreview>;
}

/**
 * Brings one account's content back to how it was in a backup. Rows that are gone, deleted or changed
 * are written as they were; rows made since the backup are left alone; nothing is deleted. Each written
 * row is stamped as changed now by this admin, so every device takes the restored copy over its own.
 * One transaction: all of it or none. A copy of the live database is taken first.
 */
export async function restoreAccount(source: BackupSource, date: string, accountId: string, adminUserId: string, now: number = Date.now()): Promise<RestoreAccountResult> {
  const safety = await source.safetyCopy();
  const restored = (await sql.begin(async (tx) => {
    const { plans } = await planAccount(tx, source, date, accountId);
    const out: { table: string; rows: number }[] = [];
    // Parents first (profiles, then TABLE_NAMES in its dependency order).
    for (const plan of plans) {
      const columns = plan.common.filter((c) => c !== 'version');
      if (!columns.includes('id')) continue;
      const value = (c: string) => (c === 'client_updated_at' ? tx`${now}::bigint` : c === 'updated_by' ? tx`${adminUserId}::uuid` : tx`b.${tx(c)}`);
      const selected = columns.map(value).reduce((list, part, i) => (i === 0 ? part : tx`${list}, ${part}`));
      const updates = columns
        .filter((c) => c !== 'id')
        .map((c) => tx`${tx(c)} = excluded.${tx(c)}`)
        .reduce((list, part, i) => (i === 0 ? part : tx`${list}, ${part}`));
      const result = await tx`
        insert into ${tx(plan.table)} (${tx(columns)})
        select ${selected}
        from ${tx(tempName(plan.table))} b left join ${tx(plan.table)} l on l.id = b.id
        where ${scope(tx, plan.table, 'b', accountId)} and b.deleted_at is null and not ${sameAs(tx, plan.ignore)}
        on conflict (id) do update set ${updates}`;
      out.push({ table: plan.table, rows: result.count });
    }
    return out;
  })) as { table: string; rows: number }[];
  return { restored: restored.filter((r) => r.rows > 0), total: restored.reduce((sum, r) => sum + r.rows, 0), safety_copy: safety };
}

/** Rows per table in the backup and live, for the whole-database restore. */
export async function backupSummary(source: BackupSource, date: string): Promise<BackupSummary> {
  const names = (
    await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  ).map((r) => r.table_name);
  const tables: BackupSummary['tables'] = [];
  for (const table of names) {
    if (!IDENT.test(table)) continue;
    const [live] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`;
    tables.push({ table, in_backup: await countBackupRows(source, date, table), live: live?.n ?? 0 });
  }
  return { date, tables, totals: { in_backup: tables.reduce((s, t) => s + t.in_backup, 0), live: tables.reduce((s, t) => s + t.live, 0) } };
}

const IDLE: RestoreStatus = { state: 'idle', date: null, started_at: null, finished_at: null, message: null };

/** What deploy/contabo/restore.sh last wrote. Idle when it has never run. */
export async function readRestoreStatus(dir: string): Promise<RestoreStatus> {
  try {
    return { ...IDLE, ...(JSON.parse(await fs.readFile(path.join(dir, 'restore-status.json'), 'utf8')) as Partial<RestoreStatus>) };
  } catch {
    return IDLE;
  }
}

/**
 * Starts the whole-database restore. It stops this very process, so it cannot run inside it: systemd
 * starts it as its own unit, which a restart of the app does not kill. Returns as soon as it is started;
 * the screen then reads the status file.
 */
export async function startFullRestore(dir: string, script: string, date: string): Promise<void> {
  if (!DATE.test(date)) throw new AppError(400, 'bad_date', 'Not a backup date');
  await fs.access(path.join(dir, `db-${date}.dump`)).catch(() => {
    throw new AppError(404, 'not_found', 'No backup for that day');
  });
  if ((await readRestoreStatus(dir)).state === 'running') throw new AppError(409, 'already_running', 'A restore is already running');
  const unit = `chipperly-restore-${Date.now()}`;
  await run('sudo', ['-n', 'systemd-run', `--unit=${unit}`, `--uid=${process.getuid?.() ?? 0}`, `--setenv=HOME=${process.env.HOME ?? ''}`, '--no-block', 'bash', script, date]);
}

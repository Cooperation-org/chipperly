import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../env.js';

/**
 * Runtime connection: least-privilege role, used by every request. Explicit
 * pool bounds so a burst of concurrent requests (or one that never releases
 * its connection because of a bug) can't exhaust the pool and stall every
 * later request for the library's default (unbounded) wait.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(sql);

/**
 * Owner-role connection factory, used only by db/migrate.ts. Separate from
 * `sql` because migrations need DDL privileges the runtime role does not
 * have; callers must close what they open.
 */
export function createOwnerClient() {
  const ownerSql = postgres(env.DATABASE_URL_OWNER);
  return { sql: ownerSql, db: drizzle(ownerSql) };
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

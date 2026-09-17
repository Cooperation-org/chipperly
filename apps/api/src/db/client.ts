import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../env.js';

/** Runtime connection: least-privilege role, used by every request. */
export const sql = postgres(env.DATABASE_URL);
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

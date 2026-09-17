import { connectionUrl, ensureDatabase } from '../scripts/embedded.mjs';

const TEST_DB = 'chipperly_test';

/**
 * Runs once before the whole test run. Sets `DATABASE_URL`/`JWT_SECRET` in
 * `process.env` *before* anything imports `src/env.ts` (which parses
 * `process.env` at import time) — every DB/app import below is therefore
 * dynamic, not a static top-level import.
 */
export default async function globalSetup(): Promise<void> {
  await ensureDatabase(TEST_DB);
  const url = connectionUrl(TEST_DB);

  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_OWNER = url;
  process.env.JWT_SECRET ??= 'test-only-jwt-secret-not-for-production-use';

  const { default: postgres } = await import('postgres');
  const sql = postgres(url);
  try {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    // drizzle-orm/postgres-js/migrator tracks applied migrations in
    // "drizzle"."__drizzle_migrations"; drop it too or it will skip
    // re-running migrations against the freshly emptied `public` schema.
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const { runMigrations } = await import('../src/db/migrate.js');
  await runMigrations();
}

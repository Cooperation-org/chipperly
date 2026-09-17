// Reusable embedded-postgres helper, shared by scripts/dev-db.mjs and test/globalSetup.ts.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = 54329;
export const HOST = '127.0.0.1';
export const USER = 'postgres';
export const PASSWORD = 'postgres';
export const DATA_DIR = path.join(__dirname, '..', '.pgdata');

let server;
let started;

function getServer() {
  if (!server) {
    server = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      port: PORT,
      user: USER,
      password: PASSWORD,
      persistent: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
    });
  }
  return server;
}

/** Initialises the data dir if missing, starts the cluster (idempotent), returns the running server. */
export async function ensureServer() {
  const instance = getServer();
  if (!started) {
    if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      await instance.initialise();
    }
    started = instance.start();
  }
  await started;
  return instance;
}

/** Creates a database if it does not already exist. */
export async function ensureDatabase(name) {
  const instance = await ensureServer();
  const client = instance.getPgClient();
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (result.rowCount === 0) {
      await instance.createDatabase(name);
    }
  } finally {
    await client.end();
  }
}

export function connectionUrl(database) {
  return `postgres://${USER}:${PASSWORD}@${HOST}:${PORT}/${database}`;
}

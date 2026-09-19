// Reusable embedded-postgres helper, shared by scripts/dev-db.mjs and test/globalSetup.ts.
import EmbeddedPostgres from 'embedded-postgres';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
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

// Postgres keeps parallel-query segments in /dev/shm by default. When the cluster runs as an
// ordinary user (a demo VM under systemd), logind's RemoveIPC deletes those segments the moment
// that user's last shell logs out, and every query with a parallel worker then fails with
// "could not open shared memory segment". mmap keeps the segments as files under the data dir.
function ensureMmapDynamicShm() {
  const conf = path.join(DATA_DIR, 'postgresql.conf');
  if (!existsSync(conf)) return;
  const text = readFileSync(conf, 'utf8');
  if (/^\s*dynamic_shared_memory_type\s*=\s*mmap/m.test(text)) return;
  appendFileSync(conf, '\n# chipperly: survive logind RemoveIPC when running as a normal user\ndynamic_shared_memory_type = mmap\n');
}

/** Initialises the data dir if missing, starts the cluster (idempotent), returns the running server. */
export async function ensureServer() {
  const instance = getServer();
  if (!started) {
    if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      await instance.initialise();
    }
    ensureMmapDynamicShm();
    started = instance.start();
  }
  await started;
  return instance;
}

/** Stops the cluster started by ensureServer()/ensureDatabase(), if any. Safe to call when nothing was started. */
export async function stopServer() {
  if (!started) return;
  await started;
  started = undefined;
  await server.stop();
  // On Windows, EmbeddedPostgres#stop() force-kills via `taskkill /f`, which
  // doesn't give postgres a chance to remove its own postmaster.pid (same as
  // a crash) — the process is confirmed dead at this point, so it's safe to
  // clear it ourselves rather than leave it stale for the next run to trip over.
  await rm(path.join(DATA_DIR, 'postmaster.pid'), { force: true });
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

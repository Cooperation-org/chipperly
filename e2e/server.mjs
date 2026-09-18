// Boots everything `playwright.config.ts`'s webServer needs: the embedded
// Postgres, a clean `chipperly_e2e` schema, migrations, then the API itself
// (which also serves the web static export via WEB_DIR). Run directly with
// `node e2e/server.mjs` from the repo root, or via `pnpm e2e`.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { ensureDatabase, connectionUrl } from '../apps/api/scripts/embedded.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const apiDir = path.join(repoRoot, 'apps', 'api');
const webOutDir = path.join(repoRoot, 'apps', 'web', 'out');
const uploadDir = path.join(__dirname, '.uploads');

if (!existsSync(path.join(webOutDir, 'index.html'))) {
  console.error(
    `\ne2e: apps/web/out is missing (looked for ${path.join(webOutDir, 'index.html')}).\nRun "pnpm -F @chipperly/web build" first.\n`,
  );
  process.exit(1);
}

const DB_NAME = 'chipperly_e2e';
const dbUrl = connectionUrl(DB_NAME);

const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  DATABASE_URL_OWNER: dbUrl,
  JWT_SECRET: 'e2e-only-jwt-secret-at-least-forty-characters-long',
  PORT: '8123',
  HOST: '127.0.0.1',
  WEB_DIR: webOutDir,
  APP_ORIGIN: 'http://127.0.0.1:8123',
  UPLOAD_DIR: uploadDir,
  BETA_INVITE_CODE: 'e2e-beta-code',
  TEST_ENDPOINTS: '1',
  LOG_LEVEL: 'warn',
  NODE_ENV: 'production',
};

await ensureDatabase(DB_NAME);

// Drop and recreate `public` (and drizzle's own migration-tracking schema)
// so every e2e run starts from a clean, fully-migrated database — mirrors
// apps/api/test/globalSetup.ts, but resolves `postgres` from apps/api's own
// node_modules since e2e/ isn't a workspace package with that dependency.
{
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(apiDir, 'package.json'));
  const { default: postgres } = await import(pathToFileURL(require.resolve('postgres')).href);
  const sql = postgres(dbUrl);
  try {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function run(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: apiDir, env, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

console.log('e2e: running migrations against chipperly_e2e...');
await run(['--env-file=.env', '--import', 'tsx', 'src/db/migrate.ts'], 'db:migrate');

console.log('e2e: starting API on http://127.0.0.1:8123 ...');
const server = spawn(process.execPath, ['--env-file=.env', '--import', 'tsx', 'src/server.ts'], {
  cwd: apiDir,
  env,
  stdio: 'inherit',
});

server.on('exit', (code) => {
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client.js';

// Read as data (not a TS import) so this works from both `src` (tsx) and
// `dist` (built) without fighting tsc's `rootDir`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
  version: string;
};

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    let db: 'up' | 'down' = 'up';
    try {
      await sql`select 1`;
    } catch {
      db = 'down';
    }
    return { ok: db === 'up', db, version: pkg.version };
  });
}

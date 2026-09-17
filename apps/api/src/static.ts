import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { env } from './env.js';

/**
 * Serves the Next.js static export. `@fastify/static`'s default `index:
 * ['index.html']` already maps a directory path (`/today/`) to its
 * `index.html`; we only add cache headers and a 404.html fallback that
 * never serves `index.html` for an unknown path.
 *
 * Not wrapped with `fastify-plugin`: called directly on the root app
 * instance (see app.ts) so `setNotFoundHandler` applies globally.
 */
export async function registerStatic(app: FastifyInstance): Promise<void> {
  if (!env.WEB_DIR) return;
  const root = path.resolve(env.WEB_DIR);
  const prefix = env.BASE_PATH || '/';
  const apiPrefix = `${env.BASE_PATH}/api`;

  await app.register(fastifyStatic, {
    root,
    prefix,
    setHeaders(reply, filePath) {
      const rel = path.relative(root, filePath);
      if (rel.startsWith(`_next${path.sep}static${path.sep}`)) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (rel.endsWith('.html') || rel === 'sw.js') {
        reply.header('Cache-Control', 'no-cache');
      }
    },
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith(apiPrefix)) {
      reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }
    reply.code(404).sendFile('404.html', root);
  });
}

import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import type { Env } from './env.js';
import registerErrors from './plugins/errors.js';
import registerAuth from './plugins/auth.js';
import { registerStatic } from './static.js';
import healthRoutes from './routes/health.js';

export interface BuildAppOptions {
  readonly env: Env;
}

const routePlugins: FastifyPluginAsync[] = [
  healthRoutes,
  // Extension point: other agents append their route plugins here (auth, me, accounts, sync, media, share).
];

export async function buildApp({ env }: BuildAppOptions): Promise<FastifyInstance> {
  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: isDev ? { target: 'pino-pretty' } : undefined,
    },
  });

  // Called directly (no `.register()`) so these apply to the root instance
  // and every route registered afterwards, with no encapsulation boundary.
  await registerErrors(app);
  await registerAuth(app);

  if (env.CORS_ORIGIN) {
    await app.register(cors, { origin: env.CORS_ORIGIN });
  }

  // High global default; individual routes override via `{ config: { rateLimit: {...} } }`.
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  await app.register(multipart);

  const apiPrefix = `${env.BASE_PATH}/api`;
  for (const plugin of routePlugins) {
    await app.register(plugin, { prefix: apiPrefix });
  }

  if (env.WEB_DIR) {
    await registerStatic(app);
  }

  return app;
}

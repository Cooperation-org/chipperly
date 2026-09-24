import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import type { Env } from './env.js';
import registerErrors from './plugins/errors.js';
import registerAuth from './plugins/auth.js';
import { registerStatic } from './static.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import accountsRoutes from './routes/accounts.js';
import syncRoutes from './routes/sync.js';
import mediaRoutes from './routes/media.js';
import shareRoutes from './routes/share.js';
import deviceLocationRoutes from './routes/deviceLocation.js';
import testingRoutes from './routes/testing.js';
import adminRoutes from './routes/admin.js';

export interface BuildAppOptions {
  readonly env: Env;
}

const routePlugins: FastifyPluginAsync[] = [
  healthRoutes,
  authRoutes,
  meRoutes,
  accountsRoutes,
  syncRoutes,
  mediaRoutes,
  shareRoutes,
  deviceLocationRoutes,
  adminRoutes,
];

// Test-only route, never registered outside e2e (see routes/testing.ts).
if (process.env.TEST_ENDPOINTS === '1') {
  routePlugins.push(testingRoutes);
}

export async function buildApp({ env }: BuildAppOptions): Promise<FastifyInstance> {
  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: isDev ? { target: 'pino-pretty' } : undefined,
    },
    // Bounds on a single stuck request/connection so it can't hang the
    // process instead of failing loudly.
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
  });

  // Called directly (no `.register()`) so these apply to the root instance
  // and every route registered afterwards, with no encapsulation boundary.
  await registerErrors(app);
  await registerAuth(app);

  if (env.CORS_ORIGIN) {
    // @fastify/cors defaults `methods` to 'GET,HEAD,POST' (its own hardcoded
    // default, not a Fastify route introspection) -- a cross-origin PATCH or
    // DELETE call fails preflight silently unless every method this API
    // actually uses is listed here.
    await app.register(cors, { origin: env.CORS_ORIGIN, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  }

  // `global: false`: only routes that opt in via `{ config: { rateLimit: {...} } }`
  // (auth, invites, share) are limited. Without it every unconfigured route
  // (static export assets, /me, /accounts, /sync/*, media) shares ONE
  // IP-keyed bucket with those sensitive routes, so ordinary page-load
  // traffic (dozens of JS/CSS requests per navigation, 60s sync polling)
  // saturates it and starts 429ing unrelated routes, including the ones
  // that are supposed to be protected.
  await app.register(rateLimit, { global: false, max: 1000, timeWindow: '1 minute' });
  // Backstop limits so a malformed/abusive multipart request can't hold a
  // connection open indefinitely; routes/media.ts's own request.file() call
  // sets the real (50MB) fileSize limit per upload.
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 20 } });

  const apiPrefix = `${env.BASE_PATH}/api`;
  for (const plugin of routePlugins) {
    await app.register(plugin, { prefix: apiPrefix });
  }

  if (env.WEB_DIR) {
    await registerStatic(app);
  }

  return app;
}

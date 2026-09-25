import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendDueReminders } from '../lib/reminders.js';
import { videoQueue } from '../media/queue.js';
import { AppError } from '../plugins/errors.js';

/**
 * Routes for a scheduler outside the process (the Cloudflare Worker's cron),
 * registered only when CRON_SECRET is set (see app.ts). A wrong or missing
 * `x-cron-secret` gets the same 404 as an unknown route.
 */
export default function internalRoutes(secret: string): FastifyPluginAsync {
  const expected = Buffer.from(secret);
  return async (app: FastifyInstance) => {
    app.addHook('onRequest', async (request) => {
      const given = Buffer.from(String(request.headers['x-cron-secret'] ?? ''));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new AppError(404, 'not_found', 'Not found');
      }
    });

    app.post('/internal/reminders', async () => ({ sent: await sendDueReminders() }));

    /** True while a video transcode is queued or running, so the container is not put to sleep mid-job. */
    app.get('/internal/busy', async () => ({ busy: videoQueue.size + videoQueue.pending > 0 }));
  };
}

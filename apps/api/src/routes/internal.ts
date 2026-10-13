import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { newsletterUsers } from '../lib/newsletterAudience.js';
import { dailyHandoverCheck, sendDueReminders } from '../lib/reminders.js';
import { alertNewRejections, sendSyncHealthDigest } from '../lib/syncHealth.js';
import { videoQueue } from '../media/queue.js';
import { AppError } from '../plugins/errors.js';

/** A wrong or missing secret in `header` gets the same 404 as an unknown route. */
function requireSecret(header: string, secret: string): (request: FastifyRequest) => Promise<void> {
  const expected = Buffer.from(secret);
  return async (request) => {
    const given = Buffer.from(String(request.headers[header] ?? ''));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new AppError(404, 'not_found', 'Not found');
    }
  };
}

/**
 * Routes for a scheduler outside the process (the Cloudflare Worker's cron),
 * registered only when CRON_SECRET is set (see app.ts).
 */
export default function internalRoutes(secret: string): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.addHook('onRequest', requireSecret('x-cron-secret', secret));

    app.post('/internal/reminders', async () => ({ sent: await sendDueReminders(), handovers: await dailyHandoverCheck() }));

    /** The sync health mails (lib/syncHealth.ts), for the same outside cron. */
    app.post('/internal/sync-health', async () => ({ alerted: await alertNewRejections(), digest: await sendSyncHealthDigest() }));

    /** True while a video transcode is queued or running, so the container is not put to sleep mid-job. */
    app.get('/internal/busy', async () => ({ busy: videoQueue.size + videoQueue.pending > 0 }));
  };
}

/**
 * Everyone mailable and their segment (trial / trial_expired / subscribed), for the marketing site's newsletters.
 * Its own secret (NEWSLETTER_API_SECRET): CRON_SECRET would also hand reminders to an outside cron.
 */
export function newsletterAudienceRoutes(secret: string): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.addHook('onRequest', requireSecret('x-newsletter-secret', secret));
    app.get('/internal/newsletter-audience', async () => ({ users: await newsletterUsers() }));
  };
}

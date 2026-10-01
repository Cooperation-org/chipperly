import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// What a browser may report: what broke, on which screen, in which build. Nothing about who.
const ClientErrorBodySchema = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(4000).optional(),
  path: z.string().max(200),
  commit: z.string().max(40).optional(),
});

/**
 * Uncaught errors from the web app land in the server log, so a broken screen
 * is seen without waiting for someone to describe it:
 *   journalctl -u chipperly | grep client_error
 * No session is read and nothing is stored in the database. Open to anyone,
 * so it is small, capped and rate limited.
 */
export default async function clientErrorRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/client-errors',
    { bodyLimit: 8 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const client_error = ClientErrorBodySchema.parse(request.body);
      request.log.error({ client_error, user_agent: request.headers['user-agent'] }, 'client error');
      return reply.code(204).send();
    },
  );
}

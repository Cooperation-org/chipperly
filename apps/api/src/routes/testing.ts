import type { FastifyInstance } from 'fastify';
import { getLastMailMessage } from '../lib/mailer.js';

/**
 * Test-only route, registered only when TEST_ENDPOINTS=1 (see app.ts). Lets
 * Playwright specs read the invite / reset link out of the last email sent,
 * since there is no real inbox in e2e.
 */
export default async function testingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/testing/last-mail', async () => getLastMailMessage());
}

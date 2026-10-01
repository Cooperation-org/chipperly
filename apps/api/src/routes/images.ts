import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { importImage, OpenverseError, searchImages, type SearchPage } from '../lib/openverse.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

/** Per user per minute; Openverse's registered quota is shared by every user of this server. */
export function perMinute(max: number) {
  return {
    rateLimit: {
      max: process.env.TEST_ENDPOINTS === '1' ? 1000 : max,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest): string => request.user?.id ?? request.ip,
    },
  };
}

const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(40).default(1),
});
const ImportBodySchema = z.object({ id: z.string().uuid() });

/** Turns an Openverse failure into the app's error shape; never carries upstream text. */
function friendly(err: unknown): never {
  if (err instanceof OpenverseError) {
    if (err.code === 'busy') throw new AppError(429, 'image_search_busy', 'Image search is busy. Try again in a minute.');
    if (err.code === 'not_found') throw new AppError(404, 'image_not_found', 'That image is no longer available');
    throw new AppError(422, 'bad_image', "Couldn't use that image. Try another one.");
  }
  throw err;
}

/**
 * Openverse image search, gated like billing: without OPENVERSE_CLIENT_ID and
 * OPENVERSE_CLIENT_SECRET, /images/search and /images/import 404 (checked per request).
 * /images/status always answers so the web app can learn availability without an error.
 */
export default async function imagesRoutes(app: FastifyInstance): Promise<void> {
  const enabledOnly = async (): Promise<void> => {
    if (!env.openverseEnabled) throw new AppError(404, 'not_found', 'Image search is not enabled');
  };

  app.get('/images/status', async () => ({ enabled: env.openverseEnabled }));

  app.get(
    '/images/search',
    { onRequest: enabledOnly, preHandler: requireUser, config: perMinute(30) },
    async (request): Promise<SearchPage> => {
      const { q, page } = SearchQuerySchema.parse(request.query);
      return searchImages(q, page).catch(friendly);
    },
  );

  app.post(
    '/images/import',
    { onRequest: enabledOnly, preHandler: requireUser, config: perMinute(20) },
    async (request, reply) => {
      const { id } = ImportBodySchema.parse(request.body);
      const { bytes, contentType, image } = await importImage(id).catch(friendly);
      return reply
        .header('Content-Type', contentType)
        .header('X-Image-Attribution', encodeURIComponent(image.attribution))
        .header('X-Image-Source', encodeURIComponent(image.landing_url ?? ''))
        .header('Cache-Control', 'no-store')
        .send(bytes);
    },
  );
}

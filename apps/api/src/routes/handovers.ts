import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Handover, HandoverAcceptResponse } from '@chipperly/shared/schemas/handover';
import { requireUser } from '../plugins/auth.js';
import { acceptOffer, describeOffer, openOffersFor } from '../lib/familyHandover.js';

const keyParam = z.object({ key: z.string().min(8).max(128) });

/** "Family keeps a copy": the signed-in family user looks at an offer and accepts it. */
export default async function handoverRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me/handovers', { preHandler: requireUser }, async (request): Promise<{ handovers: Handover[] }> => ({
    handovers: await openOffersFor(request.user!.id),
  }));

  app.get('/handovers/:key', { preHandler: requireUser }, async (request): Promise<Handover> =>
    describeOffer(keyParam.parse(request.params).key, request.user!.id),
  );

  app.post('/handovers/:key/accept', { preHandler: requireUser }, async (request, reply): Promise<HandoverAcceptResponse> => {
    const result = await acceptOffer(keyParam.parse(request.params).key, request.user!.id);
    reply.code(201);
    return result;
  });
}

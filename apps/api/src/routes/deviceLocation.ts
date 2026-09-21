import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import { ReportDeviceLocationBodySchema } from '@chipperly/shared/schemas/device';
import { db } from '../db/client.js';
import { devices } from '../db/schema/devices.js';
import { AppError } from '../plugins/errors.js';

const deviceIdParamSchema = z.object({ id: uuidSchema });

/**
 * Answers a locate request (POST /me/devices/:id/locate in routes/me.ts).
 * Not behind requireUser: this runs from a killed app's FCM callback with no
 * WebView/JS bridge and thus no access to the caregiver's session tokens, so
 * it's authenticated instead by report_token matching what the server handed
 * this specific device at registration (routes/me.ts's PUT /me/devices/:id).
 */
export default async function deviceLocationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/devices/:id/location', async (request): Promise<{ ok: true }> => {
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = ReportDeviceLocationBodySchema.parse(request.body);

    const [device] = await db.select({ report_token: devices.report_token }).from(devices).where(eq(devices.id, id));
    if (!device || !device.report_token || device.report_token !== body.report_token) {
      throw new AppError(404, 'not_found', 'Device not found');
    }

    await db
      .update(devices)
      .set({
        last_lat: body.lat,
        last_lng: body.lng,
        last_location_accuracy_m: body.accuracy_m ?? null,
        last_location_at: body.at,
      })
      .where(eq(devices.id, id));

    return { ok: true };
  });
}

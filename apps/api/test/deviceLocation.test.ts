import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import type { Device } from '@chipperly/shared/schemas/device';
import { buildTestApp, request } from './helpers.js';
import { createUser } from './fixtures.js';

describe('POST /devices/:id/location', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerDevice(token: string): Promise<{ deviceId: string; reportToken: string }> {
    const deviceId = uuidv7();
    const register = await request(app, {
      method: 'PUT',
      url: `/api/me/devices/${deviceId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { platform: 'android' },
    });
    return { deviceId, reportToken: (register.json() as { report_token: string }).report_token };
  }

  it("accepts the device's own report_token and updates its last known location", async () => {
    const admin = await createUser('Location Owner');
    const { deviceId, reportToken } = await registerDevice(admin.token);

    const report = await request(app, {
      method: 'POST',
      url: `/api/devices/${deviceId}/location`,
      payload: { report_token: reportToken, lat: 40.7128, lng: -74.006, accuracy_m: 12.5, at: Date.now() },
    });
    expect(report.statusCode).toBe(200);

    const list = await request(app, {
      method: 'GET',
      url: '/api/me/devices',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    const device = (list.json() as { devices: Device[] }).devices.find((d) => d.id === deviceId);
    expect(device).toMatchObject({ last_lat: 40.7128, last_lng: -74.006, last_location_accuracy_m: 12.5 });
  });

  it('rejects a mismatched report_token', async () => {
    const admin = await createUser('Wrong Token Owner');
    const { deviceId } = await registerDevice(admin.token);

    const report = await request(app, {
      method: 'POST',
      url: `/api/devices/${deviceId}/location`,
      payload: { report_token: 'not-the-real-token', lat: 1, lng: 1, at: Date.now() },
    });
    expect(report.statusCode).toBe(404);
  });

  it('404s for a device id that was never registered', async () => {
    const report = await request(app, {
      method: 'POST',
      url: `/api/devices/${uuidv7()}/location`,
      payload: { report_token: 'anything', lat: 1, lng: 1, at: Date.now() },
    });
    expect(report.statusCode).toBe(404);
  });
});

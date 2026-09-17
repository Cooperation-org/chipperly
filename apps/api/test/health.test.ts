import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, request } from './helpers.js';

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok and the database as up', async () => {
    const response = await request(app, { method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; db: string; version: string };
    expect(body.ok).toBe(true);
    expect(body.db).toBe('up');
    expect(typeof body.version).toBe('string');
  });
});

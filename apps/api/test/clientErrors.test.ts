import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, request } from './helpers.js';

describe('POST /api/client-errors', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes a report with no session and answers with no content', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/client-errors',
      payload: { message: 'x is not a function', stack: 'at y (app.js:1:2)', path: '/today/', commit: 'abc1234' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('refuses a report with no message or an oversized one', async () => {
    const empty = await request(app, { method: 'POST', url: '/api/client-errors', payload: { path: '/today/' } });
    expect(empty.statusCode).toBe(400);
    const long = await request(app, { method: 'POST', url: '/api/client-errors', payload: { message: 'a'.repeat(501), path: '/today/' } });
    expect(long.statusCode).toBe(400);
  });
});

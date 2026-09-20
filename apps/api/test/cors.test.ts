import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/env.js';

describe('CORS (methods must cover every verb the API uses, not just @fastify/cors\'s GET/HEAD/POST default)', () => {
  it('preflight allows PATCH and DELETE', async () => {
    const app = await buildApp({ env: { ...env, CORS_ORIGIN: 'https://localhost' } });
    await app.ready();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/me/pin',
      headers: { origin: 'https://localhost', 'access-control-request-method': 'PATCH' },
    });

    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
  });
});

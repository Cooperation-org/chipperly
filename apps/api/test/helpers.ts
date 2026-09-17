import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { env } from '../src/env.js';

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp({ env });
  await app.ready();
  return app;
}

export function request(app: FastifyInstance, options: InjectOptions): Promise<LightMyRequestResponse> {
  return app.inject(options);
}

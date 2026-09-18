import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import type { z } from 'zod';
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

/**
 * Parses a response body with the shared zod schema that's supposed to describe it, so a route and
 * its shared schema can't silently drift apart. Fails with the zod issues (path + message) on mismatch.
 */
export function expectShape<S extends z.ZodType>(response: LightMyRequestResponse, schema: S): z.infer<S> {
  const result = schema.safeParse(response.json());
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`response body did not match ${schema.description ?? 'schema'}:\n${issues.join('\n')}`);
  }
  return result.data;
}

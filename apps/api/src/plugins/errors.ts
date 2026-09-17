import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/** Thrown by route handlers for any expected failure; caught by the error handler below. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default async function errorsPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      reply.code(error.status).send({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: { code: 'validation', message: 'Invalid request', issues: error.issues },
      });
      return;
    }
    // Fastify wraps body/query schema failures with a `validation` array; treat the same as a ZodError.
    const maybeFastifyValidation = error as { validation?: unknown; statusCode?: number; message?: string };
    if (Array.isArray(maybeFastifyValidation.validation)) {
      reply.code(400).send({
        error: { code: 'validation', message: 'Invalid request', issues: maybeFastifyValidation.validation },
      });
      return;
    }
    request.log.error(error);
    const statusCode =
      typeof maybeFastifyValidation.statusCode === 'number' ? maybeFastifyValidation.statusCode : 500;
    if (statusCode >= 500) {
      reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong' } });
      return;
    }
    reply
      .code(statusCode)
      .send({ error: { code: 'error', message: maybeFastifyValidation.message ?? 'Something went wrong' } });
  });
}

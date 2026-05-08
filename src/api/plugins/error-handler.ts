import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ResponseValidationError } from 'fastify-type-provider-zod';
import { AppError } from '../../utils/errors';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function flattenZod(err: ZodError): unknown {
  return err.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
    code: i.code,
  }));
}

/**
 * Centralized error handler. Branches:
 *
 *   1. Fastify request-validation errors (Zod issues) → 400 with details
 *   2. Response validation errors                     → 500 (programmer error)
 *   3. AppError subclasses                            → declared statusCode + code
 *   4. Other 4xx Fastify errors                       → pass through
 *   5. Anything else                                  → 500, scrubbed in production
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    // Fastify v4 + the Zod type provider: when the validator returns an Error,
    // Fastify reuses it directly and stamps `code=FST_ERR_VALIDATION`. The
    // ZodError itself surfaces here either via `error.cause` or as the error
    // itself (depending on Fastify's wrapping behavior).
    if (error.code === 'FST_ERR_VALIDATION' || (error as { validation?: unknown }).validation) {
      const candidates: unknown[] = [
        error,
        (error as { cause?: unknown }).cause,
        (error as { validation?: unknown }).validation,
      ];
      const zod = candidates.find((c): c is ZodError => c instanceof ZodError);
      const details = zod
        ? flattenZod(zod)
        : (error as { validation?: unknown }).validation;
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details,
        },
      };
      return reply.status(400).send(body);
    }

    if (error instanceof ResponseValidationError) {
      request.log.error({ err: error }, 'Response failed schema validation');
      const body: ErrorBody = {
        error: {
          code: 'RESPONSE_VALIDATION_ERROR',
          message: 'Server produced an invalid response',
        },
      };
      return reply.status(500).send(body);
    }

    if (error instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: flattenZod(error),
        },
      };
      return reply.status(400).send(body);
    }

    if (error instanceof AppError) {
      const body: ErrorBody = {
        error: { code: error.code, message: error.message },
      };
      return reply.status(error.statusCode).send(body);
    }

    // Fastify's own typed errors (e.g. payload too large, unsupported media type)
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      const body: ErrorBody = {
        error: {
          code: error.code ?? 'BAD_REQUEST',
          message: error.message,
        },
      };
      return reply.status(error.statusCode).send(body);
    }

    request.log.error({ err: error }, 'Unhandled error');
    const isProd = process.env.NODE_ENV === 'production';
    const body: ErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProd ? 'Internal server error' : error.message,
      },
    };
    return reply.status(500).send(body);
  });
}

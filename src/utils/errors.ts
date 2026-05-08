/**
 * Domain errors. The Fastify error handler maps these to HTTP responses
 * so that controllers can throw without knowing about transport concerns.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UpstreamError extends AppError {
  constructor(message: string) {
    super(message, 502, 'UPSTREAM_ERROR');
  }
}

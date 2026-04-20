import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const HTTP_STATUS_MAP: Record<string, number> = {
  UPLOAD_INVALID_TYPE: 415,
  UPLOAD_TOO_LARGE: 413,
  UPLOAD_PARSE_FAILED: 422,
  EXTRACTION_INVALID_JSON: 422,
  EXTRACTION_SCHEMA_INVALID: 422,
  PROFILE_SAVE_CONFLICT: 409,
  DISPATCH_FAILED: 502,
  RATE_LIMITED: 429,
  MEDIA_PROMPT_REJECTED: 422,
  MEDIA_JOB_EXPIRED: 410,
  MEDIA_REGEN_LIMIT_REACHED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
};

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn({
      requestId,
      module: 'errorHandler',
      action: 'appError',
      code: err.code,
      status: 'failure',
    }, err.message);

    res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details ?? {},
      },
    });
    return;
  }

  logger.error({ requestId, module: 'errorHandler', err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
      details: {},
    },
  });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found.`,
      requestId: req.requestId,
      details: {},
    },
  });
}

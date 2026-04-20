import { Request, Response, NextFunction } from 'express';
import { getRedis } from './redis';
import { AppError } from '../middleware/errorHandler';

const TTL_SECONDS = 86400; // 24 hours

export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-idempotency-key'] as string | undefined;
  if (!key) {
    next(new AppError('RATE_LIMITED', 'X-Idempotency-Key header is required for this endpoint.', 422));
    return;
  }

  const redisKey = `v2:idempotency:${key}`;
  const redis = getRedis();

  redis.get(redisKey).then((cached) => {
    if (cached) {
      const parsed = JSON.parse(cached) as { status: number; body: unknown };
      res.status(parsed.status).json(parsed.body);
      return;
    }

    // Intercept the response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      redis.setex(redisKey, TTL_SECONDS, JSON.stringify({ status: res.statusCode, body })).catch(() => {});
      return originalJson(body);
    };

    next();
  }).catch(() => next());
}

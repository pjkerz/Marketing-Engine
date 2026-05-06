import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/redis';
import { AppError } from './errorHandler';

interface RateLimitConfig {
  max: number;
  windowSeconds: number;
  keyFn: (req: Request) => string;
}

export function rateLimit(config: RateLimitConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const redis = getRedis();
      const key = `v2:ratelimit:${config.keyFn(req)}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, config.windowSeconds);
      }
      if (count > config.max) {
        next(new AppError('RATE_LIMITED', 'Too many requests. Please slow down.', 429));
        return;
      }
      next();
    } catch {
      // If Redis is down, allow the request through (fail open)
      next();
    }
  };
}

export const uploadResumeLimit = rateLimit({
  max: 5,
  windowSeconds: 600,
  keyFn: (req) => `${req.actor?.affiliateCode ?? req.params.code}:upload-resume`,
});

export const generateContentLimit = rateLimit({
  max: 30,
  windowSeconds: 3600,
  keyFn: (req) => `${req.actor?.affiliateCode ?? req.params.code}:generate-content`,
});

export const generateImageLimit = rateLimit({
  max: 20,
  windowSeconds: 3600,
  keyFn: (req) => `${req.actor?.affiliateCode ?? req.params.code}:generate-image`,
});

export const generalLimit = rateLimit({
  max: 100,
  windowSeconds: 60,
  keyFn: (req) => `ip:${req.ip}:general`,
});

export const adminLimit = rateLimit({
  max: 200,
  windowSeconds: 60,
  keyFn: (req) => `admin:${req.ip}`,
});

// Dedicated tracking endpoint limiter — separate budget from general API
export const trackingLimit = rateLimit({
  max: 120,
  windowSeconds: 60,
  keyFn: (req) => `track:ip:${req.ip}`,
});

// SECURITY: Strict login rate limiting — 3 attempts per 5 minutes per IP
// Prevents brute-force and credential enumeration attacks
export const loginLimit = rateLimit({
  max: 3,
  windowSeconds: 300,
  keyFn: (req) => {
    const username = (req.body as any)?.username || 'unknown';
    return `login:${username}:${req.ip}`;
  },
});

// SECURITY: PIN verification rate limiting — 5 attempts per 5 minutes per IP
// Prevents PIN brute-force attacks on admin panel
export const pinLimit = rateLimit({
  max: 5,
  windowSeconds: 300,
  keyFn: (req) => `pin:${req.ip}`,
});

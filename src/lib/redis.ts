import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

let redisInstance: Redis | null = null;
let bullRedisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisInstance.on('error', (err) => {
      logger.error({ module: 'redis', action: 'connectionError', err: err.message }, 'Redis error');
    });
    redisInstance.on('connect', () => {
      logger.info({ module: 'redis', action: 'connected' }, 'Redis connected');
    });
  }
  return redisInstance;
}

// Separate connection for BullMQ — requires maxRetriesPerRequest: null
export function getBullRedis(): Redis {
  if (!bullRedisInstance) {
    bullRedisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    bullRedisInstance.on('error', (err) => {
      logger.error({ module: 'redis', action: 'bullConnectionError', err: err.message }, 'BullMQ Redis error');
    });
  }
  return bullRedisInstance;
}

export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}

import { Redis } from 'ioredis';
import config from './config.ts';
import { logger } from './logger.ts';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
  ...(config.redisTls ? { tls: { rejectUnauthorized: false } } : {}),
});

redis.on('error', (err: Error) => logger.error({ err: err.message }, 'redis error'));
redis.on('connect', () => logger.info('redis connected'));

export async function redisPing(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

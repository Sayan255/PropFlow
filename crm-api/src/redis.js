import { Redis } from 'ioredis';
import config from '../config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const redisDup = () => redis.duplicate();
redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
redis.on('connect', () => logger.info('redis connected'));

export async function cacheGetJson(key) {
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheSetJson(key, value, ttlSeconds) {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

/** Deletes keys matching a glob pattern (scan-based, safe for clusters). */
export async function cacheDeletePattern(pattern) {
  let cursor = '0';
  const deleted = [];
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length) {
      await redis.del(...keys);
      deleted.push(...keys);
    }
  } while (cursor !== '0');
  return deleted;
}

/** Distributed lock via SET NX EX; returns release function or null. */
export async function acquireLock(name, ttlSeconds) {
  const token = crypto.randomUUID();
  const ok = await redis.set(`lock:${name}`, token, 'EX', ttlSeconds, 'NX');
  if (!ok) return null;
  return async () => {
    const current = await redis.get(`lock:${name}`);
    if (current === token) await redis.del(`lock:${name}`);
  };
}

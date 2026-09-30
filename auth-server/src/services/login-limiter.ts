import config from '../config.ts';
import { redis } from '../redis.ts';

const ATTEMPT_TTL = 900; // 15 minutes

function key(ip: string, email: string): string {
  return `rl:login:${ip}:${email}`;
}

export interface LoginRateState {
  locked: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Returns current attempt state for ip+email without consuming anything. */
export async function getLoginState(ip: string, email: string): Promise<LoginRateState> {
  const ttl = await redis.ttl(key(ip, email));
  const count = Number((await redis.get(key(ip, email))) ?? 0);
  if (ttl > 0 && count >= config.login.maxFailedAttempts) {
    return { locked: true, remaining: 0, retryAfterSeconds: ttl };
  }
  return {
    locked: false,
    remaining: Math.max(0, config.login.maxFailedAttempts - count),
    retryAfterSeconds: Math.max(ttl, 0),
  };
}

/** Records a failed attempt; returns the new state. */
export async function recordFailedLogin(ip: string, email: string): Promise<LoginRateState> {
  const k = key(ip, email);
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, ATTEMPT_TTL);
  if (count >= config.login.maxFailedAttempts) {
    // Keep the lock for the full lockout window from the 5th failure.
    await redis.expire(k, config.login.lockoutSeconds);
    return { locked: true, remaining: 0, retryAfterSeconds: config.login.lockoutSeconds };
  }
  return { locked: false, remaining: Math.max(0, config.login.maxFailedAttempts - count), retryAfterSeconds: 0 };
}

export async function clearLoginFailures(ip: string, email: string): Promise<void> {
  await redis.del(key(ip, email));
}

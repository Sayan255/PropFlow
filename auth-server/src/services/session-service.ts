import crypto from 'node:crypto';
import config from '../config.ts';
import { redis } from '../redis.ts';

const RT_PREFIX = 'rt:';
const FAMILY_PREFIX = 'rtfam:';

export interface SessionUser {
  sub: string;
  tid: string | null;
  role: string;
}

export interface RefreshResult {
  user: SessionUser;
  newToken: string;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function rtKey(token: string): string {
  return RT_PREFIX + sha256(token);
}

function famKey(familyId: string): string {
  return FAMILY_PREFIX + familyId;
}

interface RtEntry {
  userId: string;
  tenantId: string | null;
  role: string;
  familyId: string;
  status: 'ACTIVE' | 'USED' | 'REVOKED';
  expiresAt: number; // epoch ms
}

async function writeEntry(token: string, entry: RtEntry): Promise<void> {
  const ttlMs = entry.expiresAt - Date.now();
  await redis.set(rtKey(token), JSON.stringify(entry), 'PX', Math.max(1000, ttlMs));
}

async function readEntry(token: string): Promise<RtEntry | null> {
  const raw = await redis.get(rtKey(token));
  return raw ? (JSON.parse(raw) as RtEntry) : null;
}

/** Creates a new session family and the first refresh token. */
export async function createSession(user: SessionUser): Promise<string> {
  const familyId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + config.refreshTokenTtlSeconds * 1000;
  await redis.sadd(famKey(familyId), rtKey(token));
  await redis.expire(famKey(familyId), config.refreshTokenTtlSeconds);
  await writeEntry(token, {
    userId: user.sub,
    tenantId: user.tid,
    role: user.role,
    familyId,
    status: 'ACTIVE',
    expiresAt,
  });
  return token;
}

/** Rotates a refresh token. Reuse of a USED token revokes the whole family (theft detection). */
export async function rotateRefreshToken(token: string): Promise<RefreshResult> {
  const entry = await readEntry(token);
  if (!entry) {
    const err = new Error('Invalid refresh token') as Error & { status?: number; code?: string };
    err.status = 401;
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }
  if (entry.status === 'REVOKED') {
    const err = new Error('Session revoked') as Error & { status?: number; code?: string };
    err.status = 401;
    err.code = 'SESSION_REVOKED';
    throw err;
  }
  if (entry.status === 'USED') {
    // Token theft: revoke the entire family.
    await revokeFamily(entry.familyId);
    const err = new Error('Refresh token reuse detected') as Error & { status?: number; code?: string };
    err.status = 401;
    err.code = 'TOKEN_REUSE';
    throw err;
  }

  const nextToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Math.min(Date.now() + config.refreshTokenTtlSeconds * 1000, entry.expiresAt);
  await writeEntry(token, { ...entry, status: 'USED' });
  await redis.sadd(famKey(entry.familyId), rtKey(nextToken));
  await redis.expire(famKey(entry.familyId), config.refreshTokenTtlSeconds);
  await writeEntry(nextToken, {
    userId: entry.userId,
    tenantId: entry.tenantId,
    role: entry.role,
    familyId: entry.familyId,
    status: 'ACTIVE',
    expiresAt,
  });
  return {
    user: { sub: entry.userId, tid: entry.tenantId, role: entry.role },
    newToken: nextToken,
  };
}

export async function revokeFamily(familyId: string): Promise<void> {
  const members = await redis.smembers(famKey(familyId));
  if (members.length > 0) await redis.del(...members);
  await redis.del(famKey(familyId));
}

export async function revokeToken(token: string): Promise<void> {
  const entry = await readEntry(token);
  if (!entry) return;
  await redis.del(rtKey(token));
}

/** Revokes every refresh token of a user across all families (logout-all). */
export async function revokeAllForUser(userId: string): Promise<number> {
  const pattern = RT_PREFIX + '*';
  let cursor = '0';
  let revoked = 0;
  const families = new Set<string>();
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    if (keys.length === 0) continue;
    const values = await redis.mget(...keys);
    keys.forEach((k, i) => {
      const v = values[i];
      if (!v) return;
      const entry = JSON.parse(v) as RtEntry;
      if (entry.userId === userId) {
        families.add(entry.familyId);
      }
    });
  } while (cursor !== '0');
  for (const fam of families) {
    await revokeFamily(fam);
    revoked += 1;
  }
  return revoked;
}

/** Records a security event (stream list, capped). */
export async function recordSecurityEvent(evt: {
  type: string;
  userId?: string;
  tenantId?: string | null;
  ip?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const payload = JSON.stringify({ ...evt, at: new Date().toISOString() });
  await redis.lpush('security:events', payload);
  await redis.ltrim('security:events', 0, 499);
}

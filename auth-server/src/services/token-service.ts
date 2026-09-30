import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { User } from '../db/models.ts';
import config from '../config.ts';
import { getCurrentKid, signAccessToken } from '../keys.ts';
import type { SessionUser } from './session-service.ts';

export function parseTtlSeconds(ttl: string): number {
  const m = /^(\d+)([smh])$/.exec(ttl);
  if (!m) return 60;
  const n = Number(m[1]);
  return m[2] === 's' ? n : m[2] === 'm' ? n * 60 : n * 3600;
}

/** Issues an RS256 access token for a user (claims per spec). */
export async function issueAccessToken(user: SessionUser): Promise<{ token: string; expiresIn: number; kid: string }> {
  const ttlSeconds = parseTtlSeconds(config.jwt.accessTtl);
  const now = Math.floor(Date.now() / 1000);
  const token = await signAccessToken({
    sub: user.sub,
    tid: user.tid,
    role: user.role,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  });
  return { token, expiresIn: ttlSeconds, kid: getCurrentKid() };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(config.cookies.name, token, {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/auth',
    maxAge: config.refreshTokenTtlSeconds * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.cookies.name, {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/auth',
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  return req.cookies?.[config.cookies.name];
}

export function sessionUserFromDbUser(user: User): SessionUser {
  return { sub: user.id, tid: user.tenantId, role: user.role };
}

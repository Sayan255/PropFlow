import { jwtVerify, createRemoteJWKSet } from 'jose';
import config from '../config.js';
import { forbidden, unauthorized } from './errors.js';
import { ROLE_PERMISSIONS } from '@propflow/shared';

/** Remote JWKS with caching (jose caches by kid). */
const JWKS = createRemoteJWKSet(new URL(config.authJwksUrl), {
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  cooldownDuration: 30_000,
});

/** Verifies an access token; returns claims { sub, tid, role, jti }. */
export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      clockTolerance: 2,
    });
    return payload;
  } catch (err) {
    // Unknown/mismatched kid → jose already refetches; anything left is a hard 401.
    throw unauthorized(err?.code === 'ERR_JWT_EXPIRED' ? 'Token expired' : 'Invalid access token');
  }
}

export function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Missing bearer token'));
  verifyAccessToken(header.slice(7))
    .then((claims) => {
      req.user = { sub: claims.sub, tid: claims.tid ?? null, role: claims.role, jti: claims.jti };
      next();
    })
    .catch(next);
}

/** Ensures a tenant-bound user (not SUPER_ADMIN) and attaches scope helpers. */
export function tenantScope(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.tid) return next(forbidden('Platform accounts cannot access CRM data'));
  next();
}

/** Reusable permission middleware: authorize('property:export'). */
export function authorize(permission) {
  return (req, _res, next) => {
    const allowed = ROLE_PERMISSIONS[req.user?.role]?.includes(permission);
    if (!allowed) return next(forbidden(`Missing permission: ${permission}`));
    next();
  };
}

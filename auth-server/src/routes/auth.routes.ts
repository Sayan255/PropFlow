import * as crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { acceptInviteSchema, inviteSchema, loginSchema, registerTenantSchema } from '@propflow/shared';
import config from '../config.ts';
import { User as UserModel, Invitation as InvitationModel, sequelize } from '../db/models.ts';
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../http/errors.ts';
import { validateBody } from '../http/validate.ts';
import { hashPassword, verifyPassword } from '../services/tenant-service.ts';
import {
  clearRefreshCookie,
  issueAccessToken,
  readRefreshCookie,
  sessionUserFromDbUser,
  setRefreshCookie,
} from '../services/token-service.ts';
import {
  createSession,
  recordSecurityEvent,
  revokeAllForUser,
  revokeToken,
  rotateRefreshToken,
} from '../services/session-service.ts';
import { clearLoginFailures, getLoginState, recordFailedLogin } from '../services/login-limiter.ts';
import { registerTenant } from '../services/tenant-service.ts';

export const authRouter = Router();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const ip = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : '';
  return ip || req.ip || 'unknown';
}

type AuthUser = { sub: string; tid: string | null; role: string; jti: string };

/** Verifies a local access token against the current JWKS (used for /auth/invite + logout). */
async function requireAuthUser(req: Request): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const token = header.slice(7);
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  const jwksUrl = process.env.AUTH_JWKS_URL ?? `http://127.0.0.1:${config.port}/.well-known/jwks.json`;
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, jwks, { issuer: 'propflow-auth', audience: 'propflow-api' });
  return payload as unknown as AuthUser;
}

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

/* ── POST /auth/register-tenant ─────────────────────────────────────────── */

authRouter.post(
  '/register-tenant',
  validateBody(registerTenantSchema),
  wrap(async (req, res) => {
    const input = req.body as z.infer<typeof registerTenantSchema>;
    const { tenant, admin } = await registerTenant(input);
    const sessionUser = sessionUserFromDbUser(admin);
    const rt = await createSession(sessionUser);
    const access = await issueAccessToken(sessionUser);
    setRefreshCookie(res, rt);
    res.status(201).json({
      accessToken: access.token,
      expiresIn: access.expiresIn,
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, tenantId: tenant.id },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    });
  }),
);

/* ── POST /auth/login ───────────────────────────────────────────────────── */

authRouter.post(
  '/login',
  validateBody(loginSchema),
  wrap(async (req, res) => {
    const ip = clientIp(req);
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const state = await getLoginState(ip, email);
    if (state.locked) {
      throw tooMany('Too many failed attempts. Account temporarily locked.', {
        retryAfterSeconds: state.retryAfterSeconds,
      });
    }

    const user = await UserModel.findOne({ where: { email } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !ok) {
      const after = await recordFailedLogin(ip, email);
      if (after.locked) {
        await recordSecurityEvent({ type: 'LOGIN_LOCKOUT', userId: user?.id, ip });
        throw tooMany('Too many failed attempts. Account temporarily locked.', {
          retryAfterSeconds: after.retryAfterSeconds,
        });
      }
      throw unauthorized('Invalid email or password', { attemptsRemaining: after.remaining });
    }
    if (user.status === 'DISABLED') throw forbidden('Account is deactivated');
    if (user.status === 'INVITED') throw forbidden('Invitation not yet accepted');

    await clearLoginFailures(ip, email);
    await user.update({ lastLoginAt: new Date() });

    const sessionUser = sessionUserFromDbUser(user);
    const rt = await createSession(sessionUser);
    const access = await issueAccessToken(sessionUser);
    setRefreshCookie(res, rt);
    res.status(200).json({
      accessToken: access.token,
      expiresIn: access.expiresIn,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    });
  }),
);

/* ── POST /auth/refresh ─────────────────────────────────────────────────── */

authRouter.post(
  '/refresh',
  wrap(async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw unauthorized('Missing refresh token');
    try {
      const result = await rotateRefreshToken(token);
      const access = await issueAccessToken(result.user);
      setRefreshCookie(res, result.newToken);
      res.status(200).json({ accessToken: access.token, expiresIn: access.expiresIn });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

/* ── POST /auth/logout ──────────────────────────────────────────────────── */

authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) {
      await revokeToken(token);
      await recordSecurityEvent({ type: 'LOGOUT', ip: clientIp(req) });
    }
    clearRefreshCookie(res);
    res.status(204).send();
  }),
);

/* ── POST /auth/logoutall ───────────────────────────────────────────────── */

authRouter.post(
  '/logoutall',
  wrap(async (req, res) => {
    const auth = await requireAuthUser(req);
    const revoked = await revokeAllForUser(auth.sub);
    await recordSecurityEvent({ type: 'LOGOUT_ALL', userId: auth.sub, detail: { families: revoked } });
    clearRefreshCookie(res);
    res.status(204).send();
  }),
);

/* ── Invitations ────────────────────────────────────────────────────────── */

function invitationToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = sha256Hex(token);
  return { token, hash };
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

authRouter.post(
  '/invite',
  validateBody(inviteSchema),
  wrap(async (req, res) => {
    const auth = await requireAuthUser(req);
    if (auth.role !== 'ADMIN') throw forbidden('Only ADMIN can invite users');
    if (!auth.tid) throw forbidden('SUPER_ADMIN cannot invite into a tenant');

    const input = req.body as z.infer<typeof inviteSchema>;
    const target = await UserModel.findOne({ where: { email: input.email } });
    if (target && target.tenantId !== auth.tid) {
      throw conflict('Email already registered in another tenant');
    }

    const { token, hash } = invitationToken();
    const expiresAt = new Date(Date.now() + config.inviteTtlHours * 3600 * 1000);
    await InvitationModel.create({
      tenantId: auth.tid,
      email: input.email,
      name: input.name ?? null,
      role: input.role,
      tokenHash: hash,
      expiresAt,
      consumedAt: null,
      invitedBy: auth.sub,
    });
    await recordSecurityEvent({ type: 'INVITE_CREATED', userId: auth.sub, tenantId: auth.tid, detail: { role: input.role } });
    const link = `${config.frontendUrl}/invite/accept?token=${token}`;
    res.status(201).json({ invitationLink: link, expiresAt: expiresAt.toISOString(), role: input.role, email: input.email });
  }),
);

authRouter.post(
  '/acceptinvite',
  validateBody(acceptInviteSchema),
  wrap(async (req, res) => {
    const input = req.body as z.infer<typeof acceptInviteSchema>;
    const hash = sha256Hex(input.token);
    const invite = await InvitationModel.findOne({ where: { tokenHash: hash } });
    if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
      throw badRequest('Invitation is invalid, already used, or expired');
    }
    const existing = await UserModel.findOne({ where: { email: invite.email } });
    if (existing && existing.tenantId !== invite.tenantId) {
      throw conflict('Email already registered in another tenant');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await sequelize.transaction(async (t) => {
      await invite.update({ consumedAt: new Date() }, { transaction: t });
      if (existing) {
        await existing.update(
          { tenantId: invite.tenantId, role: invite.role, status: 'ACTIVE', name: input.name, passwordHash },
          { transaction: t },
        );
        return existing;
      }
      return UserModel.create(
        {
          tenantId: invite.tenantId,
          email: invite.email,
          name: input.name,
          passwordHash,
          role: invite.role,
          status: 'ACTIVE',
        },
        { transaction: t },
      );
    });

    const sessionUser = sessionUserFromDbUser(user);
    const rt = await createSession(sessionUser);
    const access = await issueAccessToken(sessionUser);
    setRefreshCookie(res, rt);
    res.status(200).json({
      accessToken: access.token,
      expiresIn: access.expiresIn,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    });
  }),
);

/* ── JWKS ───────────────────────────────────────────────────────────────── */

export async function jwksHandler(_req: Request, res: Response): Promise<void> {
  const { getJwksCached } = await import('../keys.ts');
  res.json(await getJwksCached());
}

authRouter.get('/jwks.json', wrap(jwksHandler));

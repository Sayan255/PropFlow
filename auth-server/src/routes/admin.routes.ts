import { Router } from 'express';
import { z } from 'zod';
import { slugify } from '@propflow/shared';
import { Tenant, User } from '../db/models.ts';
import { validateBody } from '../http/validate.ts';
import { conflict, forbidden } from '../http/errors.ts';
import { hashPassword } from '../services/tenant-service.ts';
import { getCurrentKid, rotateSigningKeys } from '../keys.ts';
import { redis } from '../redis.ts';

export const adminRouter = Router();

/** SUPER_ADMIN guard: tokens carry no tid (platform scope). */
function requireSuperAdmin(payload: { tid: string | null; role: string }): void {
  if (payload.role !== 'SUPER_ADMIN' || payload.tid !== null) {
    throw forbidden('SUPER_ADMIN access required');
  }
}

async function authPayload(req: { headers: Record<string, unknown> }): Promise<{ sub: string; tid: string | null; role: string }> {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw forbidden();
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  const jwksUrl = process.env.AUTH_JWKS_URL ?? 'http://127.0.0.1:4001/.well-known/jwks.json';
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(header.slice(7), JWKS, { issuer: 'propflow-auth', audience: 'propflow-api' });
  return payload as unknown as { sub: string; tid: string | null; role: string };
}

const createTenantSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/).optional(),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(10).max(128),
});

adminRouter.get('/platform/tenants', (req, res, next) => {
  authPayload(req)
    .then(async (payload) => {
      requireSuperAdmin(payload);
      const tenants = await Tenant.findAll({ order: [['createdAt', 'DESC']] });
      const rows = await Promise.all(
        tenants.map(async (t) => {
          const [userCount, adminCount] = await Promise.all([
            User.count({ where: { tenantId: t.id } }),
            User.count({ where: { tenantId: t.id, role: 'ADMIN' } }),
          ]);
          return {
            id: t.id,
            name: t.name,
            slug: t.slug,
            status: t.status,
            createdAt: t.createdAt,
            userCount,
            adminCount,
            // propertyCount comes from crm-api aggregation via Redis (svc:propcount:{tenantId})
            propertyCount: Number((await redis.get(`svc:propcount:${t.id}`)) ?? 0),
          };
        }),
      );
      res.json({ tenants: rows });
    })
    .catch(next);
});

adminRouter.post(
  '/platform/tenants',
  validateBody(createTenantSchema),
  (req, res, next) => {
    authPayload(req)
      .then(async (payload) => {
        requireSuperAdmin(payload);
        const input = req.body as z.infer<typeof createTenantSchema>;
        const slug = input.slug ?? slugify(input.companyName);
        const existing = await Tenant.findOne({ where: { slug } });
        if (existing) throw conflict('Slug already taken', { field: 'slug' });
        const existingUser = await User.findOne({ where: { email: input.adminEmail } });
        if (existingUser) throw conflict('Email already registered', { field: 'adminEmail' });
        const passwordHash = await hashPassword(input.adminPassword);
        const created = await Tenant.sequelize!.transaction(async (t) => {
          const tenant = await Tenant.create({ name: input.companyName, slug, status: 'ACTIVE' }, { transaction: t });
          await User.create(
            {
              tenantId: tenant.id,
              email: input.adminEmail,
              name: input.adminName,
              passwordHash,
              role: 'ADMIN',
              status: 'ACTIVE',
            },
            { transaction: t },
          );
          return tenant;
        });
        res.status(201).json({ tenant: { id: created.id, name: created.name, slug: created.slug, status: created.status } });
      })
      .catch(next);
  },
);

adminRouter.post('/rotate-keys', (req, res, next) => {
  authPayload(req)
    .then(async (payload) => {
      requireSuperAdmin(payload);
      const previousKid = getCurrentKid();
      const { newKid } = await rotateSigningKeys();
      res.status(200).json({ rotatedTo: newKid, previousKid });
    })
    .catch(next);
});

adminRouter.get('/security/events', (req, res, next) => {
  authPayload(req)
    .then(async (payload) => {
      requireSuperAdmin(payload);
      const raw = await redis.lrange('security:events', 0, 99);
      res.json({ events: raw.map((r) => JSON.parse(r)) });
    })
    .catch(next);
});

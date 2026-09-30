import { Router } from 'express';
import { z } from 'zod';
import { dashboardQuerySchema } from '@propflow/shared';
import { authenticate, tenantScope, authorize } from '../middleware/auth.js';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { ah } from '../util/async-handler.js';
import { getDashboard } from '../services/dashboard-service.js';
import { redis } from '../redis.js';
import { AuthUser } from '../services/auth-users.js';
import { unprocessable } from '../util/errors.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, tenantScope);

dashboardRouter.get(
  '/',
  authorize('dashboard:view'),
  validateQuery(dashboardQuerySchema),
  ah(async (req, res) => {
    const data = await getDashboard(req.user.tid, req.parsedQuery.from, req.parsedQuery.to);
    res.json(data);
  }),
);

/* ── Tenant user management (ADMIN) — users live in auth_db; read-only mirror via auth service API is
     replaced here by direct Redis/HTTP. For simplicity we expose auth-db users through the auth-server. */

export const userRouter = Router();
userRouter.use(authenticate, tenantScope, authorize('users:manage'));

const roleChangeSchema = z.object({ role: z.enum(['ADMIN', 'MANAGER', 'AGENT']) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });

userRouter.get(
  '/',
  ah(async (req, res) => {
    const users = await AuthUser.findAll({
      where: { tenantId: req.user.tid },
      attributes: ['id', 'email', 'name', 'role', 'status', 'lastLoginAt', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    res.json({ data: users });
  }),
);

userRouter.patch(
  '/:id/role',
  validateBody(roleChangeSchema),
  ah(async (req, res) => {
    const user = await AuthUser.findOne({ where: { id: req.params.id, tenantId: req.user.tid } });
    if (!user) throw notFoundish();
    if (user.role === 'ADMIN' && req.body.role !== 'ADMIN') {
      const admins = await AuthUser.count({ where: { tenantId: req.user.tid, role: 'ADMIN', status: 'ACTIVE' } });
      if (admins <= 1) throw unprocessable('Cannot demote the last ADMIN');
    }
    await user.update({ role: req.body.role });
    res.json({ id: user.id, role: user.role });
  }),
);

userRouter.patch(
  '/:id/status',
  validateBody(statusSchema),
  ah(async (req, res) => {
    const user = await AuthUser.findOne({ where: { id: req.params.id, tenantId: req.user.tid } });
    if (!user) throw notFoundish();
    if (user.role === 'ADMIN' && req.body.status === 'DISABLED') {
      const admins = await AuthUser.count({ where: { tenantId: req.user.tid, role: 'ADMIN', status: 'ACTIVE' } });
      if (admins <= 1) throw unprocessable('Cannot deactivate the last ADMIN');
    }
    await user.update({ status: req.body.status });
    if (req.body.status === 'DISABLED') await redis.publish('pf:user-disabled', user.id);
    res.json({ id: user.id, status: user.status });
  }),
);

function notFoundish() {
  const e = new Error('User not found');
  e.status = 404;
  e.code = 'NOT_FOUND';
  e.details = {};
  throw e;
}

/* SUPER_ADMIN platform aggregates (counts only; no property details). */
export const platformRouter = Router();
platformRouter.use(authenticate);

platformRouter.get(
  '/tenants/:id/counts',
  ah(async (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN' || req.user.tid) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'SUPER_ADMIN only', details: {} } });
    const rows = await (await import('../db.js')).sequelize.query(
      `SELECT COUNT(*) AS propertyCount,
              SUM(status IN ('Listed','SiteVisit','Negotiation')) AS activeCount
       FROM properties WHERE tenant_id = :tid AND deleted_at IS NULL`,
      { replacements: { tid: req.params.id }, type: (await import('sequelize')).QueryTypes.SELECT },
    );
    await redis.set(`svc:propcount:${req.params.id}`, String(rows[0]?.propertyCount ?? 0));
    res.json({ propertyCount: Number(rows[0]?.propertyCount ?? 0), activeCount: Number(rows[0]?.activeCount ?? 0) });
  }),
);

platformRouter.get(
  '/security/events',
  ah(async (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN' || req.user.tid) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'SUPER_ADMIN only', details: {} } });
    const raw = await redis.lrange('security:events', 0, 99);
    res.json({ events: raw.map((r) => JSON.parse(r)) });
  }),
);

void validateBody;

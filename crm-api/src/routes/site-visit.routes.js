import { Router } from 'express';
import { siteVisitCreateSchema, siteVisitUpdateSchema } from '@propflow/shared';
import { authenticate, tenantScope } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ah } from '../util/async-handler.js';
import { listSiteVisits, createSiteVisit, updateSiteVisit, overdueVisits } from '../services/site-visit-service.js';
import { emitVisitReminder } from '../realtime/emit.js';

export const siteVisitRouter = Router();
siteVisitRouter.use(authenticate, tenantScope);

siteVisitRouter.get(
  '/',
  ah(async (req, res) => {
    const visits = await listSiteVisits(req.user, {
      from: req.query.from,
      to: req.query.to,
      propertyId: req.query.propertyId,
    });
    res.json({ data: visits.map(serializeVisit) });
  }),
);

siteVisitRouter.get(
  '/overdue',
  ah(async (req, res) => {
    const visits = await overdueVisits(req.user.tid, req.user.role === 'AGENT' ? req.user.sub : null);
    res.json({ data: visits.map(serializeVisit) });
  }),
);

siteVisitRouter.post(
  '/',
  validateBody(siteVisitCreateSchema),
  ah(async (req, res) => {
    const visit = await createSiteVisit(req.user, req.body);
    res.status(201).json(serializeVisit(visit));
  }),
);

siteVisitRouter.patch(
  '/:id',
  validateBody(siteVisitUpdateSchema),
  ah(async (req, res) => {
    const visit = await updateSiteVisit(req.user, req.params.id, req.body);
    res.json(serializeVisit(visit));
  }),
);

function serializeVisit(v) {
  return {
    id: String(v.id),
    propertyId: String(v.propertyId),
    agentId: v.agentId,
    visitAtUtc: v.visitAtUtc,
    remindedAt: v.remindedAt,
    outcome: v.outcome,
    createdAt: v.createdAt,
  };
}

void emitVisitReminder;

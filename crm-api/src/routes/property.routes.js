import { Router } from 'express';
import { propertyCreateSchema, propertyUpdateSchema, propertyQuerySchema, bulkRequestSchema } from '@propflow/shared';
import { authenticate, tenantScope, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { ah } from '../util/async-handler.js';
import { conflict } from '../util/errors.js';
import {
  listProperties,
  getPropertyScoped,
  createProperty,
  updatePropertyOptimistic,
  softDeleteProperty,
  bulkUpdate,
  serializeProperty,
  propertyActivityTimeline,
} from '../services/property-service.js';
import { PropertyNote, SiteVisit } from '../models.js';
import { emitPropertyUpdated } from '../realtime/emit.js';
import { cacheDeletePattern } from '../redis.js';

export const propertyRouter = Router();

propertyRouter.use(authenticate, tenantScope);

/* AGENT sees only own rows — enforced in service via forceAssigneeId. */
function assigneeScope(req) {
  return req.user.role === 'AGENT' ? { tenantId: req.user.tid, assigneeId: req.user.sub } : { tenantId: req.user.tid };
}

propertyRouter.get(
  '/',
  validateQuery(propertyQuerySchema),
  ah(async (req, res) => {
    const { rows, total } = await listProperties(req.parsedQuery, assigneeScope(req));
    res.json({
      data: rows.map((r) => serializeProperty(r, req.user)),
      meta: { page: req.parsedQuery.page, pageSize: req.parsedQuery.pageSize, total },
    });
  }),
);

propertyRouter.post(
  '/',
  authorize('property:create'),
  validateBody(propertyCreateSchema),
  ah(async (req, res) => {
    const input = { ...req.body };
    if (req.user.role === 'AGENT') input.assigneeId = req.user.sub;
    try {
      const property = await createProperty(req.user.tid, req.user.sub, input);
      res.status(201).json(serializeProperty(property, req.user));
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        throw conflict('A property with this building + unit already exists', { fields: ['buildingName', 'unitNo'] });
      }
      throw err;
    }
  }),
);

propertyRouter.get(
  '/export',
  authorize('property:export'),
  ah(async (req, res) => {
    const { streamPropertiesExport } = await import('../services/export-service.js');
    await streamPropertiesExport(req, res);
  }),
);

propertyRouter.post(
  '/bulk',
  authorize('property:bulk'),
  validateBody(bulkRequestSchema),
  ah(async (req, res) => {
    const result = await bulkUpdate(req.user.tid, req.user.sub, req.body);
    await cacheDeletePattern('dash:*');
    emitPropertyUpdated(req.user.tid, { bulk: true, count: result.updated });
    res.json(result);
  }),
);

propertyRouter.get(
  '/:id',
  ah(async (req, res) => {
    const property = await getPropertyScoped(req.params.id, req.user);
    const [notes, visits, activities] = await Promise.all([
      PropertyNote.findAll({ where: { propertyId: property.id, tenantId: req.user.tid }, order: [['created_at', 'DESC']], limit: 100 }),
      SiteVisit.findAll({ where: { propertyId: property.id, tenantId: req.user.tid }, order: [['visit_at_utc', 'DESC']] }),
      propertyActivityTimeline(property.id, req.user.tid),
    ]);
    res.json({
      property: serializeProperty(property, req.user),
      notes: notes.map((n) => ({ id: String(n.id), userId: n.userId, body: n.body, createdAt: n.createdAt })),
      visits: visits.map((v) => ({ id: String(v.id), agentId: v.agentId, visitAtUtc: v.visitAtUtc, outcome: v.outcome })),
      activities: activities.map((a) => ({
        id: String(a.id),
        userId: a.userId,
        changedFields: a.changedFields,
        createdAt: a.createdAt,
      })),
    });
  }),
);

propertyRouter.patch(
  '/:id',
  validateBody(propertyUpdateSchema),
  ah(async (req, res) => {
    const { property, changes } = await updatePropertyOptimistic(req.params.id, req.user.tid, req.user, req.body);
    await cacheDeletePattern('dash:*');
    emitPropertyUpdated(req.user.tid, { propertyId: String(property.id), changes });
    res.json(serializeProperty(property, req.user));
  }),
);

propertyRouter.delete(
  '/:id',
  authorize('property:delete'),
  ah(async (req, res) => {
    await softDeleteProperty(req.params.id, req.user);
    await cacheDeletePattern('dash:*');
    res.status(204).send();
  }),
);

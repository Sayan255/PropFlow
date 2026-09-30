import { Op } from 'sequelize';
import { SiteVisit, Property } from '../models.js';
import { notFound, unprocessable } from '../util/errors.js';

function rawId(id) {
  return Number(id);
}

/** AGENT sees only own visits; ADMIN/MANAGER see the whole tenant (team calendar). */
export async function listSiteVisits(viewer, { from, to, propertyId = null }) {
  const where = { tenantId: viewer.tid };
  if (viewer.role === 'AGENT') where.agentId = viewer.sub;
  if (from || to) {
    where.visitAtUtc = {
      ...(from ? { [Op.gte]: new Date(from) } : {}),
      ...(to ? { [Op.lte]: new Date(to) } : {}),
    };
  }
  if (propertyId) where.propertyId = rawId(propertyId);
  return SiteVisit.findAll({ where, order: [['visit_at_utc', 'ASC']], limit: 2000 });
}

export async function createSiteVisit(viewer, input) {
  const property = await Property.findOne({
    where: { id: rawId(input.propertyId), tenantId: viewer.tid, deletedAt: null },
  });
  if (!property) throw notFound('Property not found');
  if (viewer.role === 'AGENT' && property.assigneeId !== viewer.sub) throw notFound('Property not found');

  return sequelize_transaction_create(viewer, input);
}

async function sequelize_transaction_create(viewer, input) {
  return SiteVisit.create({
    propertyId: rawId(input.propertyId),
    tenantId: viewer.tid,
    agentId: viewer.sub,
    visitAtUtc: new Date(input.visitAtUtc),
    outcome: 'Scheduled',
  });
}

export async function updateSiteVisit(viewer, id, patch) {
  const visit = await SiteVisit.findOne({ where: { id: rawId(id), tenantId: viewer.tid } });
  if (!visit) throw notFound('Visit not found');
  if (viewer.role === 'AGENT' && visit.agentId !== viewer.sub) throw notFound('Visit not found');

  if (patch.visitAtUtc) visit.visitAtUtc = new Date(patch.visitAtUtc);
  if (patch.outcome) {
    if (visit.remindedAt && patch.outcome === 'Scheduled') {
      throw unprocessable('Cannot reschedule after reminder fired; cancel and create a new visit');
    }
    visit.outcome = patch.outcome;
  }
  await visit.save();
  return visit;
}

export async function overdueVisits(tenantId, agentId = null) {
  const where = {
    tenantId,
    outcome: 'Scheduled',
    visitAtUtc: { [Op.lt]: new Date() },
  };
  if (agentId) where.agentId = agentId;
  return SiteVisit.findAll({ where, order: [['visit_at_utc', 'ASC']], limit: 100 });
}

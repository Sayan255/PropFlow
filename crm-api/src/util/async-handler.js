import { Op } from 'sequelize';
import { buildFreeTextClause } from './search.js';

/** Wraps async express handlers to forward errors. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/**
 * Builds the tenant-scoped Sequelize where clause from parsed query.
 * AGENT role must additionally constrain assigneeId — handled by caller via forceAssigneeId.
 */
export function buildPropertyWhere(q, tenantId, { forceAssigneeId = null, includeDeleted = false } = {}) {
  const where = { tenantId };
  if (forceAssigneeId) where.assigneeId = forceAssigneeId;
  if (!includeDeleted) where.deletedAt = null;
  if (q.status) where.status = { [Op.in]: q.status.split(',') };
  if (q.listingType) where.listingType = q.listingType;
  if (q.propertyType) where.propertyType = { [Op.in]: q.propertyType.split(',') };
  if (q.bhk !== undefined && q.bhk !== null) where.bhk = q.bhk;
  if (q.priceMin !== undefined || q.priceMax !== undefined) {
    where.priceInr = {
      ...(q.priceMin !== undefined ? { [Op.gte]: q.priceMin } : {}),
      ...(q.priceMax !== undefined ? { [Op.lte]: q.priceMax } : {}),
    };
  }
  if (q.areaMin !== undefined || q.areaMax !== undefined) {
    where.carpetAreaSqft = {
      ...(q.areaMin !== undefined ? { [Op.gte]: q.areaMin } : {}),
      ...(q.areaMax !== undefined ? { [Op.lte]: q.areaMax } : {}),
    };
  }
  if (q.locality) where.locality = { [Op.in]: q.locality.split(',') };
  if (q.agentId) where.assigneeId = forceAssigneeId ?? q.agentId;
  if (q.amenities) {
    // JSON array containment via LIKE on JSON string (portable, index-friendly enough for filtered views)
    const list = q.amenities.split(',').filter(Boolean);
    where[Op.and] = list.map((a) => ({
      amenities: { [Op.like]: `%"${a.replace(/"/g, '')}"%` },
    }));
  }
  if (q.dateFrom || q.dateTo) {
    where.createdAt = {
      ...(q.dateFrom ? { [Op.gte]: new Date(`${q.dateFrom}T00:00:00.000Z`) } : {}),
      ...(q.dateTo ? { [Op.lte]: new Date(`${q.dateTo}T23:59:59.999Z`) } : {}),
    };
  }
  if (q.q) {
    const like = buildFreeTextClause(q.q);
    Object.assign(where, like);
  }
  return where;
}

/** Maps API sort fields to columns. */
export const SORT_COLUMNS = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  price: 'price_inr',
  carpetAreaSqft: 'carpet_area_sqft',
  title: 'title',
  status: 'status',
  locality: 'locality',
};

import { Property } from '../models.js';

/** Same rules as REST getPropertyScoped, for socket joins: wrong tenant/agent → error. */
export async function getPropertyScopedForSocket(propertyId, user) {
  const property = await Property.findOne({ where: { id: Number(propertyId), tenantId: user.tid, deletedAt: null } });
  if (!property) throw new Error('not found');
  if (user.role === 'AGENT' && property.assigneeId !== user.sub) throw new Error('not found');
  return property;
}

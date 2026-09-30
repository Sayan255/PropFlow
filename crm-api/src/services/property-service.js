import { Op } from 'sequelize';
import { maskPhone, TERMINAL_STATUSES } from '@propflow/shared';
import { sequelize, Property, PropertyActivity } from '../models.js';
import { notFound, conflict, unprocessable } from '../util/errors.js';
import { buildPropertyWhere, SORT_COLUMNS } from '../util/async-handler.js';

const LIST_ATTRIBUTES = [
  'id',
  'title',
  'listingType',
  'bhk',
  'propertyType',
  'status',
  'buildingName',
  'unitNo',
  'locality',
  'city',
  'priceInr',
  'carpetAreaSqft',
  'assigneeId',
  'version',
  'isStale',
  'createdAt',
  'updatedAt',
];

const rawId = (id) => Number(id);

/** Serializes a property; masks owner phone unless viewer is ADMIN/MANAGER or the assignee. */
export function serializeProperty(p, viewer) {
  const plain = p.get({ plain: true });
  const canSeePhone = viewer.role === 'ADMIN' || viewer.role === 'MANAGER' || viewer.sub === plain.assigneeId;
  return {
    id: String(plain.id),
    tenantId: plain.tenantId,
    title: plain.title,
    listingType: plain.listingType,
    bhk: plain.bhk,
    furnishing: plain.furnishing,
    status: plain.status,
    propertyType: plain.propertyType,
    buildingName: plain.buildingName,
    unitNo: plain.unitNo,
    floor: plain.floor,
    totalFloors: plain.totalFloors,
    locality: plain.locality,
    city: plain.city,
    address: plain.address,
    ownerName: plain.ownerName,
    ownerPhone: canSeePhone ? plain.ownerPhone : maskPhone(plain.ownerPhone),
    ownerPhoneVisible: canSeePhone,
    priceInr: String(plain.priceInr),
    carpetAreaSqft: plain.carpetAreaSqft,
    amenities: plain.amenities ?? [],
    assigneeId: plain.assigneeId,
    version: Number(plain.version),
    isStale: plain.isStale,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

/** Server-side filter/sort/pagination list. AGENT sees only own rows via forceAssigneeId. */
export async function listProperties(query, { tenantId, assigneeId = null }) {
  const where = buildPropertyWhere(query, tenantId, { forceAssigneeId: assigneeId });
  const col = SORT_COLUMNS[query.sortBy] ?? 'updated_at';
  const order = [[sequelize.literal(`\`Property\`.${col}`), query.sortDir.toUpperCase()]];
  const { rows, count } = await Property.findAndCountAll({
    where,
    attributes: LIST_ATTRIBUTES,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
    order,
  });
  return { rows, total: count };
}

/** Scoped detail: wrong tenant, other agent's row, or deleted → uniform 404. */
export async function getPropertyScoped(id, viewer) {
  const property = await Property.findOne({
    where: { id: rawId(id), tenantId: viewer.tid, deletedAt: null },
  });
  if (!property) throw notFound('Property not found');
  if (viewer.role === 'AGENT' && property.assigneeId !== viewer.sub) throw notFound('Property not found');
  return property;
}

export async function createProperty(tenantId, userId, input) {
  return sequelize.transaction(async (t) => {
    const property = await Property.create(
      { ...input, tenantId, version: 1, amenities: input.amenities ?? [] },
      { transaction: t },
    );
    await PropertyActivity.create(
      { propertyId: property.id, tenantId, userId, changedFields: { __created__: { new: true } } },
      { transaction: t },
    );
    return property;
  });
}

const TRACKED_FIELDS = [
  'title', 'listingType', 'bhk', 'furnishing', 'status', 'propertyType',
  'buildingName', 'unitNo', 'floor', 'totalFloors', 'locality', 'city', 'address',
  'ownerName', 'ownerPhone', 'priceInr', 'carpetAreaSqft', 'amenities', 'assigneeId',
];

/** Optimistic-locking PATCH. Throws 409 with the latest server copy on version mismatch. */
export async function updatePropertyOptimistic(id, tenantId, viewer, payload) {
  const property = await getPropertyScoped(id, viewer);
  const clientVersion = payload.version;
  delete payload.version;

  const throwConflict = async () => {
    const latest = await Property.findOne({ where: { id: property.id } });
    throw conflict('This property was modified by someone else', { latest: serializeProperty(latest, viewer) });
  };

  if (Number(property.version) !== clientVersion) await throwConflict();

  const changes = {};
  for (const field of TRACKED_FIELDS) {
    if (payload[field] !== undefined) {
      const before = property.get(field);
      const after = payload[field];
      if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
        changes[field] = { old: before ?? null, new: after };
      }
    }
  }
  if (Object.keys(changes).length === 0) return { property, changes: {} };

  const [affected] = await Property.update(
    { ...payload, version: clientVersion + 1 },
    { where: { id: property.id, tenantId, version: clientVersion, deletedAt: null }, limit: 1 },
  );
  if (affected === 0) await throwConflict();

  await PropertyActivity.create({ propertyId: property.id, tenantId, userId: viewer.sub, changedFields: changes });
  const fresh = await getPropertyScoped(id, viewer);
  return { property: fresh, changes };
}

export async function softDeleteProperty(id, viewer) {
  const property = await getPropertyScoped(id, viewer);
  await property.destroy(); // paranoid → sets deleted_at
  return property;
}

/** Bulk operations in ONE transaction; any failure rolls back everything. */
export async function bulkUpdate(tenantId, userId, { ids, operation }) {
  return sequelize.transaction(async (t) => {
    const numericIds = ids.map(rawId);
    const properties = await Property.findAll({
      where: { tenantId, deletedAt: null, id: { [Op.in]: numericIds } },
      transaction: t,
      lock: true,
    });
    if (properties.length !== numericIds.length) {
      throw unprocessable('One or more properties not found in your scope; nothing was changed');
    }

    const touched = [];
    for (const property of properties) {
      if (operation.op === 'status') {
        if (TERMINAL_STATUSES.includes(property.status)) {
          throw unprocessable(`Property ${property.id} is ${property.status} (terminal); nothing was changed`);
        }
        await Property.update(
          { status: operation.status, version: Number(property.version) + 1 },
          { where: { id: property.id }, transaction: t, limit: 1 },
        );
      } else if (operation.op === 'reassign') {
        await Property.update(
          { assigneeId: operation.assigneeId, version: Number(property.version) + 1 },
          { where: { id: property.id }, transaction: t, limit: 1 },
        );
      } else if (operation.op === 'amenity') {
        const set = new Set(property.amenities ?? []);
        for (const a of operation.add ?? []) set.add(a);
        for (const a of operation.remove ?? []) set.delete(a);
        await Property.update(
          { amenities: [...set], version: Number(property.version) + 1 },
          { where: { id: property.id }, transaction: t, limit: 1 },
        );
      }
      touched.push(property.id);
    }

    for (const pid of touched) {
      await PropertyActivity.create(
        { propertyId: pid, tenantId, userId, changedFields: { __bulk__: { op: operation.op } } },
        { transaction: t },
      );
    }
    return { updated: touched.length };
  });
}

export async function propertyActivityTimeline(propertyId, tenantId) {
  return PropertyActivity.findAll({
    where: { propertyId: rawId(propertyId), tenantId },
    order: [['created_at', 'DESC']],
    limit: 100,
  });
}

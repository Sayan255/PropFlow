import { Op } from 'sequelize';
import { MasterDataItem, Property } from '../models.js';
import { unprocessable, conflict } from '../util/errors.js';
import { cacheDeletePattern } from '../redis.js';

const KIND_TO_FIELD = {
  PROPERTY_TYPE: 'propertyType',
  LOCALITY: 'locality',
  STATUS: 'status',
  AMENITY: 'amenities',
};

export async function getMasterData(tenantId, kind = null) {
  const where = { tenantId, ...(kind ? { kind } : {}) };
  return MasterDataItem.findAll({ where, order: [['kind', 'ASC'], ['sortOrder', 'ASC'], ['label', 'ASC']] });
}

export async function createMasterDataItem(tenantId, input) {
  try {
    const item = await MasterDataItem.create({ ...input, tenantId });
    await invalidate(tenantId, input.kind);
    return item;
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw conflict('An item with this value already exists for the kind', { field: 'value' });
    }
    throw err;
  }
}

export async function updateMasterDataItem(tenantId, id, patch) {
  const item = await MasterDataItem.findOne({ where: { id, tenantId } });
  if (!item) throw notFoundish();
  await item.update(patch);
  await invalidate(tenantId, item.kind);
  return item;
}

export async function deleteMasterDataItem(tenantId, id) {
  const item = await MasterDataItem.findOne({ where: { id, tenantId } });
  if (!item) throw notFoundish();

  const field = KIND_TO_FIELD[item.kind];
  let inUse = 0;
  if (field === 'amenities') {
    inUse = await Property.count({
      where: { tenantId, amenities: { [Op.like]: `%"${item.value}"%` } },
    });
  } else {
    inUse = await Property.count({ where: { tenantId, [field]: item.value } });
  }
  if (inUse > 0) {
    throw unprocessable('Item is in use; deactivate it instead', { inUse });
  }
  await item.destroy();
  await invalidate(tenantId, item.kind);
  return item;
}

async function invalidate(tenantId, kind) {
  await cacheDeletePattern(`md:${tenantId}:${kind}`);
  await cacheDeletePattern(`md:${tenantId}:*`);
}

function notFoundish() {
  const err = new Error('Master data item not found');
  err.status = 404;
  err.code = 'NOT_FOUND';
  err.details = {};
  return err;
}

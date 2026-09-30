import { DataTypes, Model } from 'sequelize';
import { sequelize } from './db.js';

/** Property: BIGINT id + price (integer rupees); unique (tenant, building, unit); optimistic-lock version. */
export class Property extends Model {}
Property.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    listingType: { type: DataTypes.ENUM('Sale', 'Rent'), allowNull: false },
    bhk: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    furnishing: { type: DataTypes.ENUM('Unfurnished', 'Semi-Furnished', 'Furnished'), allowNull: false, defaultValue: 'Unfurnished' },
    status: {
      type: DataTypes.ENUM('Draft', 'Listed', 'SiteVisit', 'Negotiation', 'Closed', 'Withdrawn'),
      allowNull: false,
      defaultValue: 'Draft',
    },
    propertyType: { type: DataTypes.ENUM('Apartment', 'Villa', 'Plot', 'Commercial'), allowNull: false },
    buildingName: { type: DataTypes.STRING(120), allowNull: false },
    unitNo: { type: DataTypes.STRING(30), allowNull: false },
    floor: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    totalFloors: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    locality: { type: DataTypes.STRING(120), allowNull: false },
    city: { type: DataTypes.STRING(80), allowNull: false },
    address: { type: DataTypes.STRING(400), allowNull: true },
    ownerName: { type: DataTypes.STRING(120), allowNull: false },
    ownerPhone: { type: DataTypes.STRING(15), allowNull: false },
    priceInr: { type: DataTypes.BIGINT, allowNull: false },
    carpetAreaSqft: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    amenities: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    assigneeId: { type: DataTypes.UUID, allowNull: true },
    version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1 },
    isStale: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    deletedAt: { type: DataTypes.DATE(3), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Property',
    tableName: 'properties',
    paranoid: true,
    indexes: [
      { name: 'prop_tenant_status_idx', fields: ['tenant_id', 'status'] },
      { name: 'prop_tenant_type_idx', fields: ['tenant_id', 'listing_type'] },
      { name: 'prop_tenant_ptype_idx', fields: ['tenant_id', 'property_type'] },
      { name: 'prop_tenant_locality_idx', fields: ['tenant_id', 'locality'] },
      { name: 'prop_tenant_assignee_idx', fields: ['tenant_id', 'assignee_id'] },
      { name: 'prop_tenant_created_idx', fields: ['tenant_id', 'created_at'] },
      { name: 'prop_tenant_price_idx', fields: ['tenant_id', 'price_inr'] },
      { name: 'prop_tenant_bldg_unit_uq', unique: true, fields: ['tenant_id', 'building_name', 'unit_no'] },
    ],
  },
);

export class PropertyActivity extends Model {}
PropertyActivity.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    propertyId: { type: DataTypes.BIGINT, allowNull: false },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    changedFields: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    modelName: 'PropertyActivity',
    tableName: 'property_activities',
    updatedAt: false,
    indexes: [{ name: 'pa_property_idx', fields: ['property_id', 'created_at'] }],
  },
);

export class PropertyNote extends Model {}
PropertyNote.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    propertyId: { type: DataTypes.BIGINT, allowNull: false },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    modelName: 'PropertyNote',
    tableName: 'property_notes',
    indexes: [{ name: 'pn_property_idx', fields: ['property_id', 'created_at'] }],
  },
);

export class ChatMessage extends Model {}
ChatMessage.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    propertyId: { type: DataTypes.BIGINT, allowNull: false },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    clientMsgId: { type: DataTypes.STRING(64), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    modelName: 'ChatMessage',
    tableName: 'chat_messages',
    indexes: [
      { name: 'chat_property_client_uq', unique: true, fields: ['property_id', 'client_msg_id'] },
      { name: 'chat_property_idx', fields: ['property_id', 'created_at'] },
    ],
  },
);

export class SiteVisit extends Model {}
SiteVisit.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    propertyId: { type: DataTypes.BIGINT, allowNull: false },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    agentId: { type: DataTypes.UUID, allowNull: false },
    visitAtUtc: { type: DataTypes.DATE(3), allowNull: false },
    remindedAt: { type: DataTypes.DATE(3), allowNull: true },
    outcome: {
      type: DataTypes.ENUM('Scheduled', 'Completed', 'NoShow', 'Cancelled'),
      allowNull: false,
      defaultValue: 'Scheduled',
    },
  },
  {
    sequelize,
    modelName: 'SiteVisit',
    tableName: 'site_visits',
    indexes: [
      { name: 'sv_window_idx', fields: ['visit_at_utc', 'reminded_at'] },
      { name: 'sv_tenant_agent_idx', fields: ['tenant_id', 'agent_id', 'visit_at_utc'] },
      { name: 'sv_property_idx', fields: ['property_id', 'visit_at_utc'] },
    ],
  },
);

export class MasterDataItem extends Model {}
MasterDataItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.ENUM('PROPERTY_TYPE', 'LOCALITY', 'STATUS', 'AMENITY'), allowNull: false },
    label: { type: DataTypes.STRING(80), allowNull: false },
    value: { type: DataTypes.STRING(80), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'MasterDataItem',
    tableName: 'master_data_items',
    indexes: [
      { name: 'md_tenant_kind_idx', fields: ['tenant_id', 'kind', 'sort_order'] },
      { name: 'md_tenant_kind_value_uq', unique: true, fields: ['tenant_id', 'kind', 'value'] },
    ],
  },
);

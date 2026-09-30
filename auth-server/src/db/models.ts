import { Sequelize, DataTypes, Model, CreationOptional } from 'sequelize';
import type { Dialect } from 'sequelize';
import config from '../config.ts';

export const sequelize = new Sequelize({
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  dialect: 'mysql' as Dialect,
  logging: false,
  define: { underscored: true },
  pool: { max: 10, min: 0, idle: 10_000, acquire: 30_000 },
});

export class Tenant extends Model {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: string;
  declare status: 'ACTIVE' | 'SUSPENDED';
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
Tenant.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'SUSPENDED'), allowNull: false, defaultValue: 'ACTIVE' },
  },
  { sequelize, modelName: 'Tenant', tableName: 'tenants' },
);

export class User extends Model {
  declare id: CreationOptional<string>;
  declare tenantId: string | null;
  declare email: string;
  declare name: string;
  declare passwordHash: string;
  declare role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'AGENT';
  declare status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  declare lastLoginAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: true },
    email: { type: DataTypes.STRING(190), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    role: { type: DataTypes.ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'), allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'INVITED', 'DISABLED'), allowNull: false, defaultValue: 'ACTIVE' },
    lastLoginAt: { type: DataTypes.DATE(3), allowNull: true },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    indexes: [{ unique: true, fields: ['email'] }, { fields: ['tenant_id', 'status'] }],
  },
);

export class Invitation extends Model {
  declare id: CreationOptional<string>;
  declare tenantId: string;
  declare email: string;
  declare name: string | null;
  declare role: 'ADMIN' | 'MANAGER' | 'AGENT';
  declare tokenHash: string;
  declare expiresAt: Date;
  declare consumedAt: Date | null;
  declare invitedBy: string;
  declare createdAt: CreationOptional<Date>;
}
Invitation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: true },
    role: { type: DataTypes.ENUM('ADMIN', 'MANAGER', 'AGENT'), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE(3), allowNull: false },
    consumedAt: { type: DataTypes.DATE(3), allowNull: true },
    invitedBy: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'Invitation',
    tableName: 'invitations',
    indexes: [{ unique: true, fields: ['token_hash'] }, { fields: ['tenant_id', 'email'] }],
  },
);

export class SigningKey extends Model {
  declare kid: string;
  declare publicKeyPem: string;
  declare active: boolean;
  declare createdAt: CreationOptional<Date>;
}
SigningKey.init(
  {
    kid: { type: DataTypes.STRING(64), primaryKey: true },
    publicKeyPem: { type: DataTypes.TEXT, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: 'SigningKey', tableName: 'signing_keys' },
);

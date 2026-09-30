import { QueryInterface, DataTypes } from 'sequelize';
import { sequelize } from '../db/models.ts';

/** Idempotent, explicit migration for auth_db. */
export async function up(qi: QueryInterface = sequelize.getQueryInterface()): Promise<void> {
  await qi.createTable('tenants', {
    id: { type: DataTypes.UUID, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'SUSPENDED'), allowNull: false, defaultValue: 'ACTIVE' },
    created_at: { type: DataTypes.DATE(3), allowNull: false },
    updated_at: { type: DataTypes.DATE(3), allowNull: false },
  });

  await qi.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    email: { type: DataTypes.STRING(190), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    password_hash: { type: DataTypes.STRING(100), allowNull: false },
    role: { type: DataTypes.ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'), allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'INVITED', 'DISABLED'), allowNull: false, defaultValue: 'ACTIVE' },
    last_login_at: { type: DataTypes.DATE(3), allowNull: true },
    created_at: { type: DataTypes.DATE(3), allowNull: false },
    updated_at: { type: DataTypes.DATE(3), allowNull: false },
  });
  await qi.addIndex('users', ['email'], { unique: true, name: 'users_email_uq' });
  await qi.addIndex('users', ['tenant_id', 'status'], { name: 'users_tenant_status_idx' });

  await qi.createTable('invitations', {
    id: { type: DataTypes.UUID, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: true },
    role: { type: DataTypes.ENUM('ADMIN', 'MANAGER', 'AGENT'), allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE(3), allowNull: false },
    consumed_at: { type: DataTypes.DATE(3), allowNull: true },
    invited_by: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE(3), allowNull: false },
  });
  await qi.addIndex('invitations', ['token_hash'], { unique: true, name: 'invitations_token_uq' });
  await qi.addIndex('invitations', ['tenant_id', 'email'], { name: 'invitations_tenant_email_idx' });

  await qi.createTable('signing_keys', {
    kid: { type: DataTypes.STRING(64), primaryKey: true },
    public_key_pem: { type: DataTypes.TEXT, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE(3), allowNull: false },
  });
}

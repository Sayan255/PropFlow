import { Sequelize, DataTypes, Model } from 'sequelize';
import config from '../config.js';

/** Separate connection to auth_db — crm-api has READ-ONLY intent on users (no other auth tables touched). */
const authSequelize = new Sequelize({
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.user,
  password: config.mysql.password,
  database: process.env.MYSQL_AUTH_DATABASE ?? 'auth_db',
  dialect: 'mysql',
  ...(config.mysql.ssl ? { dialectOptions: { ssl: config.mysql.ssl } } : {}),
  logging: false,
  pool: { max: 5, min: 0, idle: 10_000 },
});

export class AuthUser extends Model {}
AuthUser.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    tenantId: { type: DataTypes.UUID, field: 'tenant_id' },
    email: { type: DataTypes.STRING(190) },
    name: { type: DataTypes.STRING(120) },
    role: { type: DataTypes.STRING(20) },
    status: { type: DataTypes.STRING(20) },
    lastLoginAt: { type: DataTypes.DATE, field: 'last_login_at' },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
  },
  { sequelize: authSequelize, modelName: 'AuthUser', tableName: 'users', timestamps: false },
);

import { sequelize } from '../src/db.js';
import { AuthUser } from '../src/services/auth-users.js';
import { redis } from '../src/redis.js';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const AGENT1_A = '11111111-1111-4111-8111-0000000000a3';
const AGENT2_A = '11111111-1111-4111-8111-0000000000a4';

let server = null;
export let baseUrl = '';

export async function bootOnce() {
  if (server) return baseUrl;
  process.env.AUTH_JWKS_URL = process.env.AUTH_JWKS_URL ?? 'http://127.0.0.1:4001/.well-known/jwks.json';
  const { createDatabase } = await import('../src/scripts/db-create.js');
  await createDatabase();
  const { sequelize: authDb } = await import('../../auth-server/src/db/models.ts');
  void authDb;
  await sequelize.sync({ force: true });
  const { seedDefaultMasterData } = await import('../src/scripts/seed-master-data.js');
  await seedDefaultMasterData();
  const { buildApp } = await import('../src/app.js');
  const app = buildApp();
  await new Promise((resolve) => {
    server = app.listen(4002, () => resolve());
  });
  baseUrl = 'http://127.0.0.1:4002';
  return baseUrl;
}

/** Creates auth users directly in auth_db for RBAC tests (bypasses auth-server HTTP). */
export async function seedAuthUsersForCrm() {
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash('Password123!', 4);
  const mk = (id, tenantId, email, role) => ({ id, tenantId, email, name: email.split('@')[0], passwordHash: hash, role, status: 'ACTIVE' });
  await AuthUser.bulkCreate([
    mk('11111111-1111-4111-8111-0000000000a1', TENANT_A, 'admin@tenant-a.local', 'ADMIN'),
    mk('11111111-1111-4111-8111-0000000000a2', TENANT_A, 'manager@tenant-a.local', 'MANAGER'),
    mk(AGENT1_A, TENANT_A, 'agent1@tenant-a.local', 'AGENT'),
    mk(AGENT2_A, TENANT_A, 'agent2@tenant-a.local', 'AGENT'),
    mk('22222222-2222-4222-8222-0000000000b1', TENANT_B, 'admin@tenant-b.local', 'ADMIN'),
    mk('22222222-2222-4222-8222-0000000000b3', TENANT_B, 'agent1@tenant-b.local', 'AGENT'),
  ]);
}

export async function teardownOnce() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
  await sequelize.close();
  redis.disconnect();
}

export async function resetDb() {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['properties', 'property_activities', 'property_notes', 'chat_messages', 'site_visits', 'master_data_items']) {
    await sequelize.query(`TRUNCATE TABLE ${t}`);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await redis.flushdb();
}

/** Signs a test access token with the auth-server dev key (fetched from its JWKS endpoint is not enough for signing —
 * tests import the auth-server signer directly). */
export async function makeToken(userId, tenantId, role) {
  const { issueTestToken } = await import('./token-forge.js');
  return issueTestToken({ sub: userId, tid: tenantId, role });
}

export const TENANT_A_ID = TENANT_A;
export const TENANT_B_ID = TENANT_B;
export const AGENT1_A_ID = AGENT1_A;
export const AGENT2_A_ID = AGENT2_A;

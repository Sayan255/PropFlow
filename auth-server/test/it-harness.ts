import http from 'node:http';
import { sequelize } from '../src/db/models.ts';
import { redis } from '../src/redis.ts';
import { migrate } from '../src/migrate.ts';
import { ensureSigningKey } from '../src/keys.ts';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '60s';

let server: http.Server | null = null;
export let baseUrl = '';

/** Idempotent boot: DB create + migrate + keys + listen on 4001. */
export async function bootOnce(): Promise<string> {
  if (server) return baseUrl;
  const { createDatabase } = await import('../src/scripts/db-create.ts');
  await createDatabase();
  await migrate();
  await ensureSigningKey();
  const { buildApp } = await import('../src/app.ts');
  const app = buildApp();
  await new Promise<void>((resolve) => {
    server = app.listen(4001, () => resolve());
  });
  baseUrl = 'http://127.0.0.1:4001';
  return baseUrl;
}

export async function teardownOnce(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  await sequelize.close();
  redis.disconnect();
}

/** Truncates all auth tables between tests (fast, keeps schema). */
export async function resetDb(): Promise<void> {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['users', 'tenants', 'invitations', 'signing_keys', 'migration_meta']) {
    await sequelize.query(`TRUNCATE TABLE ${table}`);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await redis.flushdb();
}

export { sequelize, redis };

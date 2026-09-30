import { createConnection } from 'mysql2/promise';
import config from '../config.ts';
import { logger } from '../logger.ts';

/** Creates the auth_db database if it does not exist (dev convenience). */
export async function createDatabase(): Promise<void> {
  const conn = await createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    logger.info({ db: config.mysql.database }, 'database ready');
  } finally {
    await conn.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createDatabase().catch((err) => {
    logger.error({ err }, 'db-create failed');
    process.exitCode = 1;
  });
}

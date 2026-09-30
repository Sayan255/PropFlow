import http from 'node:http';
import config from './config.ts';
import { logger } from './logger.ts';
import { redis } from './redis.ts';
import { sequelize } from './db/models.ts';
import { ensureSigningKey } from './keys.ts';
import { buildApp } from './app.ts';

const app = buildApp();
const server = http.createServer(app);

async function start(): Promise<void> {
  try {
    await sequelize.authenticate();
    logger.info('mysql connected');
    await ensureSigningKey();
    await new Promise<void>((resolve) => {
      server.listen(config.port, () => resolve());
    });
    logger.info({ port: config.port, env: config.env }, 'auth-server listening');
  } catch (err) {
    logger.error({ err }, 'failed to start auth-server');
    process.exit(1);
  }
}

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    try {
      await sequelize.close();
      redis.disconnect();
    } catch (err) {
      logger.warn({ err }, 'cleanup error');
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

void start();

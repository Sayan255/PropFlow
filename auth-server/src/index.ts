import http from 'node:http';
import config from './config.ts';
import { logger } from './logger.ts';
import { redis } from './redis.ts';
import { sequelize } from './db/models.ts';
import { ensureSigningKey } from './keys.ts';
import { buildApp } from './app.ts';

const app = buildApp();
const server = http.createServer(app);

/**
 * Race a MySQL connection against a hard timeout. TiDB (free tier) and the
 * network in front of it can stall the handshake indefinitely; without this
 * the bootstrap awaits forever, the server never listens, and Render keeps the
 * wedged instance up returning 502s (seen live 2026-10-02). Failing fast lets
 * the container restart loop recover it.
 */
async function connectDbWithTimeout(ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`mysql connect timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function start(): Promise<void> {
  try {
    await connectDbWithTimeout(30_000);
    logger.info('mysql connected');
    await ensureSigningKey();
    await new Promise<void>((resolve) => {
      server.listen(config.port, () => resolve());
    });
    logger.info({ port: config.port, env: config.env }, 'auth-server listening');
  } catch (err) {
    logger.error({ err }, 'failed to start auth-server');
    // Exit immediately (skip graceful close) so the platform restarts the
    // container instead of leaving a half-initialized process up.
    process.exit(1);
  }
}

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  // If sequelize.close() itself hangs (same failure class as boot), the timer
  // still force-exits; exit(0) so a SIGTERM restart is clean, not a crash loop.
  server.close(async () => {
    try {
      await sequelize.close();
      redis.disconnect();
    } catch (err) {
      logger.warn({ err }, 'cleanup error');
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

void start();

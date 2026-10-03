import http from 'node:http';
import config from './config.js';
import { logger } from './logger.js';
import { sequelize } from './db.js';
import { redis } from './redis.js';
import { buildApp } from './app.js';
import { attachRealtime } from './realtime/io.js';
import { startReminderJob, startStaleJob } from './cron/index.js';

const app = buildApp();
const server = http.createServer(app);

/**
 * Race a MySQL connection against a hard timeout. TiDB (free tier) can stall
 * the handshake indefinitely; without this the bootstrap awaits forever, the
 * server never listens, and Render keeps the wedged instance up (seen live on
 * the paired auth service 2026-10-02). Failing fast lets the container restart.
 */
async function connectDbWithTimeout(ms) {
  let timer;
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`mysql connect timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function start() {
  await connectDbWithTimeout(30_000);
  logger.info('mysql connected');
  await attachRealtime(server);
  if (!config.isProd || process.env.ENABLE_CRON !== 'false') {
    startReminderJob();
    startStaleJob();
  }
  server.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'crm-api listening'));
}

function shutdown(signal) {
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

start().catch((err) => {
  logger.error({ err }, 'failed to start crm-api');
  process.exit(1);
});

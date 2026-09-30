import http from 'node:http';
import config from '../config.js';
import { logger } from './logger.js';
import { sequelize } from './db.js';
import { redis } from './redis.js';
import { buildApp } from './app.js';
import { attachRealtime } from './realtime/io.js';
import { startReminderJob, startStaleJob } from './cron/index.js';

const app = buildApp();
const server = http.createServer(app);

async function start() {
  await sequelize.authenticate();
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

start().catch((err) => {
  logger.error({ err }, 'failed to start crm-api');
  process.exit(1);
});

const req = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env: ${name}`);
  return v;
};

const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.CRM_PORT ?? 4002),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  mysql: {
    host: req('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: req('MYSQL_USER', 'propflow'),
    password: process.env.MYSQL_PASSWORD ?? 'propflow-dev-password',
    database: req('MYSQL_CRM_DATABASE', 'crm_db'),
    // Managed providers (TiDB/Aiven-style) terminate TLS — set MYSQL_SSL=true.
    ssl: process.env.MYSQL_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined,
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  redisTls: process.env.REDIS_TLS === 'true',

  authJwksUrl: process.env.AUTH_JWKS_URL ?? 'http://127.0.0.1:4001/.well-known/jwks.json',
  jwtIssuer: 'propflow-auth',
  jwtAudience: 'propflow-api',

  corsOrigin: (process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  dashboardCacheTtlSeconds: Number(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? 60),
  exportMaxRows: Number(process.env.EXPORT_MAX_ROWS ?? 50000),
  exportBatchSize: 500,

  cron: {
    reminderCron: process.env.CRON_REMINDER ?? '* * * * *',
    staleCron: process.env.CRON_STALE ?? '30 20 * * *', // 02:00 IST == 20:30 UTC
    staleDays: Number(process.env.STALE_DAYS ?? 30),
    reminderWindowMinutes: 15,
    reminderLockSeconds: 55,
  },
};

export default config;

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { sequelize } from './db.js';
import config from './config.js';
import { attachRequestId, httpLogger } from './middleware/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { propertyRouter } from './routes/property.routes.js';
import { siteVisitRouter } from './routes/site-visit.routes.js';
import { masterDataRouter } from './routes/master-data.routes.js';
import { dashboardRouter, userRouter, platformRouter } from './routes/dashboard.routes.js';
import { redisPing } from './redis.js';
import { getJwksHealthy } from './health.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.corsOrigin.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(attachRequestId);
  app.use(httpLogger);

  app.get('/health', async (_req, res) => {
    const checks = { liveness: true };
    let ok = true;
    try {
      await sequelize.authenticate();
      checks.mysql = true;
    } catch {
      checks.mysql = false;
      ok = false;
    }
    checks.redis = await redisPing();
    checks.jwks = await getJwksHealthy();
    ok = ok && checks.redis && checks.jwks;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks, uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use('/properties', propertyRouter);
  app.use('/site-visits', siteVisitRouter);
  app.use('/master-data', masterDataRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/users', userRouter);
  app.use('/platform', platformRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

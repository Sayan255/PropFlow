import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import config from './config.ts';
import { logger } from './logger.ts';
import { redisPing } from './redis.ts';
import { sequelize } from './db/models.ts';
import { requestId, errorHandler, notFoundHandler } from './http/middleware.ts';
import { authRouter, jwksHandler } from './routes/auth.routes.ts';
import { adminRouter } from './routes/admin.routes.ts';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.corsOrigin.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req: unknown) => (req as { requestId: string }).requestId,
      autoLogging: { ignore: (req: unknown) => (req as { url: string }).url === '/health' },
    }),
  );

  app.get('/health', async (_req, res) => {
    const checks: Record<string, boolean> = { liveness: true };
    let ok = true;
    try {
      await sequelize.authenticate();
      checks.mysql = true;
    } catch {
      checks.mysql = false;
      ok = false;
    }
    checks.redis = await redisPing();
    ok = ok && checks.redis;
    res
      .status(ok ? 200 : 503)
      .json({ status: ok ? 'ok' : 'degraded', checks, uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get('/.well-known/jwks.json', jwksHandler);
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

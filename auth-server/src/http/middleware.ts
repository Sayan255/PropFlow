import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.ts';
import { ApiError } from './errors.ts';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  (req as Request & { requestId: string }).requestId = id;
  next();
}

type LoggerFn = (obj: object, msg: string) => void;

export function httpLogger(log: { child: (b: Record<string, unknown>) => { info: LoggerFn; warn: LoggerFn; error: LoggerFn } }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const child = log.child({ requestId: (req as Request & { requestId?: string }).requestId });
    const start = Date.now();
    res.on('finish', () => {
      const payload = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
      };
      if (res.statusCode >= 500) child.error(payload, 'http request');
      else if (res.statusCode >= 400) child.warn(payload, 'http request');
      else child.info(payload, 'http request');
    });
    next();
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', details: {} } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as Request & { requestId?: string }).requestId;
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body', details: {} } });
    return;
  }
  logger.error({ err, requestId }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error', details: {} } });
}

export { ApiError };

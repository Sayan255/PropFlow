import { logger } from '../logger.js';
import { ApiError } from './errors.js';

/** Central error envelope matching the shared error format. */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    if (err.status >= 500) req.log?.error({ err }, 'api error');
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err?.name === 'SequelizeUniqueConstraintError') {
    res.status(409).json({
      error: { code: 'DUPLICATE', message: 'Duplicate resource', details: { fields: err.errors?.map((e) => e.path) ?? [] } },
    });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body', details: {} } });
    return;
  }
  logger.error({ err, requestId: req.requestId }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error', details: {} } });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', details: {} } });
}

import { logger } from '../logger.js';

/** requestId + structured HTTP logging. */
export function attachRequestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  req.requestId = id;
  next();
}

export function httpLogger(req, res, next) {
  const start = Date.now();
  const child = logger.child({ requestId: req.requestId });
  req.log = child;
  res.on('finish', () => {
    const payload = { method: req.method, url: req.originalUrl, status: res.statusCode, durationMs: Date.now() - start };
    if (res.statusCode >= 500) child.error(payload, 'http request');
    else if (res.statusCode >= 400) child.warn(payload, 'http request');
    else child.info(payload, 'http request');
  });
  next();
}

import pino from 'pino';
import config from './config.ts';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.privateKey',
      '*.ownerPhone',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'auth-server' },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

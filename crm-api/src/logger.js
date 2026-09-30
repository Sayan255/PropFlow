import pino from 'pino';
import config from '../config.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.accessToken', '*.refreshToken', '*.ownerPhone'],
    censor: '[REDACTED]',
  },
  base: { service: 'crm-api' },
});

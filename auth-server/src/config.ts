import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env: ${name}`);
  return v;
}

/** Unescape "\n" in PEM env vars into real newlines. */
export function envPem(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  if (v.includes('-----BEGIN')) return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v;
  const fileRef = v;
  if (fs.existsSync(fileRef)) return fs.readFileSync(fileRef, 'utf8');
  return undefined;
}

const DEFAULT_KEY_ID = 'pf-dev-key-1';

function loadKeys() {
  const dir = path.resolve(__dirname, '../../keys');
  const privPath = path.join(dir, 'dev-private.pem');
  const pubPath = path.join(dir, 'dev-public.pem');
  if (process.env.JWT_PRIVATE_KEY || process.env.JWT_PUBLIC_KEY) {
    return {
      keyId: process.env.JWT_KEY_ID ?? DEFAULT_KEY_ID,
      privateKey: envPem('JWT_PRIVATE_KEY'),
      publicKey: envPem('JWT_PUBLIC_KEY'),
    };
  }
  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    return {
      keyId: process.env.JWT_KEY_ID ?? DEFAULT_KEY_ID,
      privateKey: fs.readFileSync(privPath, 'utf8'),
      publicKey: fs.readFileSync(pubPath, 'utf8'),
    };
  }
  return { keyId: process.env.JWT_KEY_ID ?? DEFAULT_KEY_ID, privateKey: undefined, publicKey: undefined };
}

const keys = loadKeys();

const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.AUTH_PORT ?? 4001),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  mysql: {
    host: req('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: req('MYSQL_USER', 'propflow'),
    password: process.env.MYSQL_PASSWORD ?? 'propflow-dev-password',
    database: req('MYSQL_AUTH_DATABASE', 'auth_db'),
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',

  jwt: {
    accessTtl: process.env.JWT_ACCESS_TTL ?? '60s',
    currentKeyId: keys.keyId,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    // Seconds an RSA keypair stays published in JWKS after rotation.
    oldKeyGraceSeconds: Number(process.env.JWT_OLD_KEY_GRACE_SECONDS ?? 3600),
  },

  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  inviteTtlHours: Number(process.env.INVITE_TTL_HOURS ?? 24),

  login: {
    maxFailedAttempts: 5,
    lockoutSeconds: 15 * 60,
  },

  cookies: {
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    sameSite: (process.env.COOKIE_SAME_SITE ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax')) as
      | 'strict'
      | 'lax'
      | 'none',
    name: 'pf_rt',
  },

  corsOrigin: (process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
};

if (config.isProd && (!config.jwt.privateKey || !config.jwt.publicKey)) {
  throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required in production');
}

export default config;
export type Config = typeof config;

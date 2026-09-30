import crypto from 'node:crypto';
import type { Transaction } from 'sequelize';
import { SignJWT, importPKCS8, importSPKI, exportJWK } from 'jose';
import config from './config.ts';
import { SigningKey, sequelize } from './db/models.ts';
import { redis } from './redis.ts';

const JWKS_CACHE_KEY = 'jwks';
const JWKS_TTL_SECONDS = 300;
const ACTIVE_KID_KEY = 'jwt:active-kid';
const PRIVATE_KEY_PREFIX = 'jwt:private:';

type ImportedKey = Awaited<ReturnType<typeof importPKCS8>>;

let currentKey: { kid: string; privateKey: ImportedKey; publicKey: ImportedKey } | null = null;

function importKeyPair(privatePem: string, publicPem: string) {
  return Promise.all([importPKCS8(privatePem, 'RS256'), importSPKI(publicPem, 'RS256')]).then(
    ([privateKey, publicKey]) => ({ privateKey, publicKey }),
  );
}

/** Ensures the configured signing key is imported and registered in DB + JWKS. */
export async function ensureSigningKey(): Promise<void> {
  const persistedKid = await redis.get(ACTIVE_KID_KEY);
  if (persistedKid) {
    const [row, privatePem] = await Promise.all([
      SigningKey.findByPk(persistedKid),
      redis.get(`${PRIVATE_KEY_PREFIX}${persistedKid}`),
    ]);
    if (row && privatePem) {
      const { privateKey, publicKey } = await importKeyPair(privatePem, row.publicKeyPem);
      currentKey = { kid: persistedKid, privateKey, publicKey };
      await refreshJwksCache();
      return;
    }
  }
  if (!config.jwt.privateKey || !config.jwt.publicKey) {
    throw new Error('Signing keys are not configured. Run `npm run keys:generate -w auth-server` in development.');
  }
  const { privateKey, publicKey } = await importKeyPair(config.jwt.privateKey, config.jwt.publicKey);
  currentKey = { kid: config.jwt.currentKeyId, privateKey, publicKey };

  await sequelize.transaction(async (t) =>
    SigningKey.upsert(
      { kid: currentKey!.kid, publicKeyPem: config.jwt.publicKey!, active: true },
      { transaction: t },
    ),
  );
  await redis.set(`${PRIVATE_KEY_PREFIX}${currentKey.kid}`, config.jwt.privateKey);
  await redis.set(ACTIVE_KID_KEY, currentKey.kid);
  await refreshJwksCache();
}

/** Generates an RS256 keypair (dev helper + rotation). */
export function generateKeyPairPem(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

async function buildJwks(): Promise<{ keys: Record<string, unknown>[] }> {
  const rows = await SigningKey.findAll({ order: [['createdAt', 'DESC']], limit: 5 });
  const keys = await Promise.all(
    rows.map(async (row) => {
      const jwk = await exportJWK(await importSPKI(row.publicKeyPem, 'RS256'));
      return { ...jwk, kid: row.kid, alg: 'RS256', use: 'sig' };
    }),
  );
  return { keys };
}

export async function refreshJwksCache(): Promise<void> {
  const jwks = await buildJwks();
  await redis.set(JWKS_CACHE_KEY, JSON.stringify(jwks), 'EX', JWKS_TTL_SECONDS);
}

/** JWKS endpoint payload (cached in Redis so multiple auth instances agree). */
export async function getJwksCached(): Promise<{ keys: Record<string, unknown>[] }> {
  const cached = await redis.get(JWKS_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const jwks = await buildJwks();
  await redis.set(JWKS_CACHE_KEY, JSON.stringify(jwks), 'EX', JWKS_TTL_SECONDS);
  return jwks;
}

export function getCurrentKid(): string {
  return currentKey?.kid ?? config.jwt.currentKeyId;
}

/** Signs an access token with the current key. */
export async function signAccessToken(claims: {
  sub: string;
  tid: string | null;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}): Promise<string> {
  const activeKid = await redis.get(ACTIVE_KID_KEY);
  if (activeKid && currentKey?.kid !== activeKid) {
    const [row, privatePem] = await Promise.all([
      SigningKey.findByPk(activeKid),
      redis.get(`${PRIVATE_KEY_PREFIX}${activeKid}`),
    ]);
    if (!row || !privatePem) throw new Error(`Active signing key ${activeKid} is unavailable`);
    const { privateKey, publicKey } = await importKeyPair(privatePem, row.publicKeyPem);
    currentKey = { kid: activeKid, privateKey, publicKey };
  }
  if (!currentKey) throw new Error('Signing key not initialized');
  const { privateKey } = currentKey;
  return new SignJWT({ tid: claims.tid, role: claims.role, jti: claims.jti })
    .setProtectedHeader({ alg: 'RS256', kid: currentKey.kid })
    .setSubject(claims.sub)
    .setIssuedAt(claims.iat)
    .setExpirationTime(claims.exp)
    .setIssuer('propflow-auth')
    .setAudience('propflow-api')
    .sign(privateKey);
}

/** Generates a fresh RSA keypair, publishes it, and makes it the signing key. Old keys remain in JWKS. */
export async function rotateSigningKeys(): Promise<{ newKid: string }> {
  if (!currentKey) throw new Error('Signing key not initialized');
  const { privateKeyPem, publicKeyPem } = generateKeyPairPem();
  const priv = await importPKCS8(privateKeyPem, 'RS256');
  const pub = await importSPKI(publicKeyPem, 'RS256');
  const kid = `pf-key-${Date.now()}`;

  await sequelize.transaction(async (t: Transaction) => {
    await SigningKey.update({ active: false }, { where: {}, transaction: t });
    await SigningKey.create({ kid, publicKeyPem, active: true }, { transaction: t });
  });

  currentKey = { kid, privateKey: priv, publicKey: pub };
  await redis.set(`${PRIVATE_KEY_PREFIX}${kid}`, privateKeyPem);
  await redis.set(ACTIVE_KID_KEY, kid);
  await refreshJwksCache();
  return { newKid: kid };
}

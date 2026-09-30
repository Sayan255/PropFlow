import { SignJWT } from 'jose';
import { importPKCS8 } from 'jose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privPath = path.resolve(__dirname, '../../../auth-server/keys/dev-private.pem');

let keyPromise = null;

/** Signs a short-lived access token for integration tests using the dev signing key. */
export async function issueTestToken(claims, ttlSeconds = 60) {
  if (!keyPromise) {
    keyPromise = importPKCS8(fs.readFileSync(privPath, 'utf8'), 'RS256');
  }
  const key = await keyPromise;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ tid: claims.tid, role: claims.role, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KEY_ID ?? 'pf-dev-key-1' })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setIssuer('propflow-auth')
    .setAudience('propflow-api')
    .sign(key);
}

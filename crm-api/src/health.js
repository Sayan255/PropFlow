import config from './config.js';

/** crm health includes JWKS reachability (auth dependency). */
export async function getJwksHealthy() {
  try {
    const res = await fetch(config.authJwksUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = await res.json();
    return Array.isArray(body.keys) && body.keys.length > 0;
  } catch {
    return false;
  }
}

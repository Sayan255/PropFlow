import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootOnce, resetDb, sequelize, redis, teardownOnce } from './it-harness.ts';

let base: string;

before(async () => {
  base = await bootOnce();
  await resetDb();
  const { seedAuth } = await import('../src/scripts/seed.ts');
  await seedAuth();
});

after(async () => {
  await teardownOnce();
});

interface LoginResponse {
  status: number;
  body: any;
  setCookie: string[];
}

async function post(path: string, data?: unknown, cookies: string[] = [], auth?: string): Promise<LoginResponse> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookies.length ? { cookie: cookies.join('; ') } : {}),
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, setCookie: res.headers.getSetCookie?.() ?? [] };
}

function getCookieValue(setCookie: string[], name: string): string | undefined {
  for (const c of setCookie) {
    const [pair] = c.split(';');
    if (!pair) continue;
    const [k, v] = pair.split('=');
    if (k?.trim() === name) return v;
  }
  return undefined;
}

describe('auth-server integration', () => {
  it('health reports mysql + redis', async () => {
    const res = await fetch(`${base}/health`);
    const body: any = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.checks.mysql, true);
    assert.equal(body.checks.redis, true);
  });

  it('JWKS exposes the signing key', async () => {
    const res = await fetch(`${base}/.well-known/jwks.json`);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.keys) && body.keys.length >= 1);
    assert.equal(body.keys[0].alg, 'RS256');
    assert.ok(body.keys[0].kid);
  });

  it('login succeeds and sets httpOnly refresh cookie', async () => {
    const r = await post('/auth/login', { email: 'admin@tenant-a.local', password: 'Password123!' });
    assert.equal(r.status, 200);
    assert.ok(r.body.accessToken);
    assert.equal(r.body.user.role, 'ADMIN');
    const raw = r.setCookie.find((c) => c.startsWith('pf_rt='));
    assert.ok(raw, 'refresh cookie set');
    assert.match(raw, /HttpOnly/i);
    const accessPayload = JSON.parse(Buffer.from(r.body.accessToken.split('.')[1], 'base64url').toString());
    assert.equal(accessPayload.role, 'ADMIN');
    assert.equal(accessPayload.tid, '11111111-1111-4111-8111-111111111111');
    assert.ok(accessPayload.jti);
  });

  it('invalid login returns 401 with attemptsRemaining and increments counter', async () => {
    const r1 = await post('/auth/login', { email: 'agent2@tenant-b.local', password: 'wrong' });
    assert.equal(r1.status, 401);
    assert.equal(r1.body.error.code, 'UNAUTHORIZED');
    assert.equal(r1.body.error.details.attemptsRemaining, 4);
  });

  it('locks after 5 failed attempts with 429 + Retry-After', async () => {
    const email = 'lockout-test@tenant-a.local';
    // Create a dedicated user to avoid interfering with other tests
    const { User } = await import('../src/db/models.ts');
    const bcrypt = (await import('bcryptjs')).default;
    await User.create({
      id: '11111111-1111-4111-8111-00000000ff01',
      tenantId: '11111111-1111-4111-8111-111111111111',
      email,
      name: 'Lockout Test',
      passwordHash: await bcrypt.hash('Password123!', 4),
      role: 'AGENT',
      status: 'ACTIVE',
    });
    for (let i = 0; i < 4; i++) {
      const r = await post('/auth/login', { email, password: 'wrong' });
      assert.equal(r.status, 401);
    }
    const fifth = await post('/auth/login', { email, password: 'wrong' });
    assert.equal(fifth.status, 429);
    const sixth = await post('/auth/login', { email, password: 'Password123!' });
    assert.equal(sixth.status, 429);
    assert.ok(sixth.body.error.details.retryAfterSeconds > 0);
  });

  it('refresh rotates the token; old token is single-use', async () => {
    const login = await post('/auth/login', { email: 'manager@tenant-a.local', password: 'Password123!' });
    const rt1 = getCookieValue(login.setCookie, 'pf_rt')!;
    assert.ok(rt1);

    const r1 = await post('/auth/refresh', undefined, [`pf_rt=${rt1}`]);
    assert.equal(r1.status, 200);
    assert.ok(r1.body.accessToken);
    const rt2 = getCookieValue(r1.setCookie, 'pf_rt')!;
    assert.notEqual(rt2, rt1);

    // Replaying RT1 = theft → family revoked
    const replay = await post('/auth/refresh', undefined, [`pf_rt=${rt1}`]);
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'TOKEN_REUSE');

    // RT2 (same family) is now dead too
    const dead = await post('/auth/refresh', undefined, [`pf_rt=${rt2}`]);
    assert.equal(dead.status, 401);
    assert.equal(dead.body.error.code, 'SESSION_REVOKED');
  });

  it('logout invalidates the refresh token', async () => {
    const login = await post('/auth/login', { email: 'agent1@tenant-a.local', password: 'Password123!' });
    const rt = getCookieValue(login.setCookie, 'pf_rt')!;
    const out = await post('/auth/logout', undefined, [`pf_rt=${rt}`]);
    assert.equal(out.status, 204);
    const after = await post('/auth/refresh', undefined, [`pf_rt=${rt}`]);
    assert.equal(after.status, 401);
  });

  it('invite → accept creates an active AGENT user in the right tenant', async () => {
    const login = await post('/auth/login', { email: 'admin@tenant-b.local', password: 'Password123!' });
    const access = login.body.accessToken;
    const inv = await post('/auth/invite', { email: 'newbie@tenant-b.local', role: 'AGENT', name: 'New Agent' }, [], access);
    assert.equal(inv.status, 201);
    const link: string = inv.body.invitationLink;
    const token = new URL(link).searchParams.get('token')!;
    const accept = await post('/auth/acceptinvite', { token, name: 'New Agent', password: 'Str0ngPass!123' });
    assert.equal(accept.status, 200);
    assert.equal(accept.body.user.tenantId, '22222222-2222-4222-8222-222222222222');
    assert.equal(accept.body.user.role, 'AGENT');

    // single-use
    const accept2 = await post('/auth/acceptinvite', { token, name: 'New Agent', password: 'Str0ngPass!123' });
    assert.equal(accept2.status, 400);
  });

  it('rotate-keys publishes a second JWK; old and new tokens both verify', async () => {
    const superLogin = await post('/auth/login', { email: 'superadmin@propflow.local', password: 'Password123!' });
    const oldAccess = superLogin.body.accessToken;
    assert.equal(superLogin.body.user.role, 'SUPER_ADMIN');

    const before: any = await (await fetch(`${base}/.well-known/jwks.json`)).json();
    const beforeCount = before.keys.length;

    const rot = await post('/admin/rotate-keys', undefined, [], oldAccess);
    assert.equal(rot.status, 200);
    assert.ok(rot.body.rotatedTo);

    const after: any = await (await fetch(`${base}/.well-known/jwks.json`)).json();
    assert.equal(after.keys.length, beforeCount + 1);

    // Old token (signed with previous key) still verifies while unexpired…
    const me = await post('/auth/logoutall', undefined, [], oldAccess);
    assert.equal(me.status, 204);
    // …and a fresh login uses the new kid.
    const fresh = await post('/auth/login', { email: 'superadmin@propflow.local', password: 'Password123!' });
    const freshPayload = JSON.parse(Buffer.from(fresh.body.accessToken.split('.')[1], 'base64url').toString());
    const jwksNow: any = await (await fetch(`${base}/.well-known/jwks.json`)).json();
    assert.ok(jwksNow.keys.some((k: any) => k.kid === freshPayload.kid));
  });

  it('rejects non-SUPER_ADMIN on admin routes', async () => {
    const login = await post('/auth/login', { email: 'admin@tenant-a.local', password: 'Password123!' });
    const r = await post('/admin/rotate-keys', undefined, [], login.body.accessToken);
    assert.equal(r.status, 403);
  });
});

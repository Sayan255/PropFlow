import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * H3 contract: 5 concurrent requests hit 401 → exactly ONE /auth/refresh fires →
 * all five requests retry and succeed. Deterministic via a call counter:
 * the first 5 calls are the initial 401s; retries only start after the refresh
 * resolves, so calls 6–10 are the retries.
 */
const apiStub = {
  dispatch: vi.fn(),
  getState: vi.fn(() => ({})),
  endpoint: 'test/endpoint',
} as never;

describe('baseQueryWithReauth (H3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('performs exactly one refresh for 5 simultaneous 401s, then all succeed', async () => {
    let refreshCalls = 0;
    let call = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 5)); // widen the race window
        return new Response(JSON.stringify({ accessToken: 'token-2', user: {} }), { status: 200 });
      }
      call += 1;
      if (call <= 5) {
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'expired', details: {} } }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true, attempt: call }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { baseQueryWithReauth } = await import('../app/baseQueryWithReauth');
    const bq = baseQueryWithReauth('/crm-api');

    const results = await Promise.all(
      Array.from({ length: 5 }, () => bq({ url: '/properties', method: 'GET' as const }, apiStub, {})),
    );

    expect(refreshCalls).toBe(1);
    expect(call).toBe(10); // 5 initial + 5 retries
    results.forEach((r) => {
      expect(r.error).toBeUndefined();
      expect((r.data as { ok: boolean }).ok).toBe(true);
    });
  });

  it('does not trigger refresh for auth endpoints themselves', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return new Response(JSON.stringify({ accessToken: 't' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'bad credentials', details: {} } }), { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { baseQueryWithReauth } = await import('../app/baseQueryWithReauth');
    const bq = baseQueryWithReauth('/auth-api');
    await bq({ url: '/auth/login', method: 'POST' }, apiStub, {});
    expect(refreshCalls).toBe(0);
  });

  it('surfaces the error when refresh fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return new Response(JSON.stringify({ error: { code: 'TOKEN_REUSE', message: 'stolen', details: {} } }), { status: 401 });
      }
      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'expired', details: {} } }), { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { baseQueryWithReauth } = await import('../app/baseQueryWithReauth');
    const bq = baseQueryWithReauth('/crm-api');
    const result = await bq({ url: '/properties', method: 'GET' as const }, apiStub, {});
    expect(result.error?.status).toBe(401);
  });
});

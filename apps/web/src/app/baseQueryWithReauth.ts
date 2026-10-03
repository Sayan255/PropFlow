import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { Role } from '@propflow/shared';

export const AUTH_BASE = '/auth-api';
export const CRM_BASE = '/crm-api';

type Args = string | FetchArgs;

/** Set VITE_API_ORIGIN to the backend edge URL for split frontend/backend hosting. */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || (
  typeof window !== 'undefined' && (window as { location?: { origin?: string } }).location?.origin
    ? (window as { location: { origin: string } }).location.origin
    : ''
)).replace(/\/$/, '');

let refreshInFlight: Promise<boolean> | null = null;

/** Exactly one concurrent /auth/refresh (H3); true when a fresh access token was obtained. */
export function doRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_ORIGIN}${AUTH_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; user?: unknown };
      window.dispatchEvent(new CustomEvent('pf:token', { detail: data }));
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function resetRefreshFlight(): void {
  refreshInFlight = null;
}

/**
 * Base query with single-flight refresh:
 *  - on 401 of a CRM call, all concurrent failures await ONE /auth/refresh, then retry once
 *  - auth endpoints themselves never trigger refresh
 * Access tokens stay in memory (authSlice) — never localStorage.
 */
export function baseQueryWithReauth(baseUrl: string): BaseQueryFn<Args, unknown, FetchBaseQueryError> {
  const rawBase = fetchBaseQuery({
    baseUrl: `${API_ORIGIN}${baseUrl}`,
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const accessToken = (getState() as { auth?: { accessToken?: string | null } }).auth?.accessToken;
      if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
      return headers;
    },
  });
  return async (args, api, extraOptions) => {
    const url = typeof args === 'string' ? args : args.url;
    const isAuthCall = url.startsWith('/auth/');

    let result = await rawBase(args, api, extraOptions);

    if (result.error?.status === 401 && !isAuthCall) {
      const ok = await doRefresh();
      if (ok) {
        result = await rawBase(args, api, extraOptions);
      }
    }
    return result;
  };
}

/** Full-URL base for slices (they pass paths like /properties; we add the service prefix once). */
export function crmQuery(): BaseQueryFn<Args, unknown, FetchBaseQueryError> {
  return baseQueryWithReauth(CRM_BASE);
}

/** Envelope for auth-server responses: success payload fields and/or error details. */
export interface AuthResponse {
  accessToken?: string;
  user?: { id: string; email: string; name: string; role: Role; tenantId: string | null };
  expiresIn?: number;
  invitationLink?: string;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/**
 * Direct fetch helper for auth endpoints (login/refresh cookie flow).
 *
 * Free-tier Render services sleep after ~15 min idle and take up to a few
 * minutes to wake; during the wake the edge returns an HTML page (or the
 * request hangs) instead of JSON. Those are transient: retry them with a
 * delay instead of failing. ANY parseable JSON response (200, 401, 429, 500…)
 * is a real app answer and returns immediately without retrying.
 */
const WAKE_MAX_ATTEMPTS = 8;
const WAKE_RETRY_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authFetchAttempt(
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<{ status: number; data: AuthResponse; retriable: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}${AUTH_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return {
      status: 0,
      retriable: true,
      data: { error: { code: 'NETWORK_ERROR', message: 'Cannot reach the API server. Check your internet connection or whether the backend is deployed.' } },
    };
  }
  let data: AuthResponse = {};
  let retriable = false;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as AuthResponse;
    } catch {
      // Non-JSON body: a free-tier service was asleep/booting and its platform
      // page came back for an API path. Retriable — not a real app error.
      retriable = true;
      data = {
        error: {
          code: 'BAD_RESPONSE',
          message: 'The backend is waking up (free-tier services sleep when idle). Please wait a moment…',
        },
      };
    }
  }
  return { status: res.status, data, retriable };
}

export async function authFetch(
  path: string,
  body?: unknown,
  method = 'POST',
  onRetry?: (attempt: number, total: number) => void,
): Promise<{ status: number; data: AuthResponse }> {
  let last!: { status: number; data: AuthResponse; retriable: boolean };
  for (let attempt = 1; attempt <= WAKE_MAX_ATTEMPTS; attempt++) {
    last = await authFetchAttempt(path, body, method);
    if (!last.retriable) return { status: last.status, data: last.data };
    if (attempt < WAKE_MAX_ATTEMPTS) {
      onRetry?.(attempt, WAKE_MAX_ATTEMPTS);
      await sleep(WAKE_RETRY_DELAY_MS);
    }
  }
  return { status: last.status, data: last.data };
}

/**
 * Free-tier keep-warm: ping both services' /health while the tab is visible so
 * an open PropFlow tab doesn't go dead mid-session (Render sleeps a service
 * after ~15 min without requests). Background tabs are skipped so we don't
 * burn the 750 free instance-hours/month when nobody is looking.
 */
const KEEP_ALIVE_INTERVAL_MS = 3 * 60_000;
let keepAliveStarted = false;

export function startBackendKeepAlive(): void {
  if (typeof window === 'undefined' || keepAliveStarted) return;
  keepAliveStarted = true;
  const ping = () => {
    if (document.hidden) return;
    void fetch(`${API_ORIGIN}${AUTH_BASE}/health`).catch(() => undefined);
    void fetch(`${API_ORIGIN}${CRM_BASE}/health`).catch(() => undefined);
  };
  ping();
  window.setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
  document.addEventListener('visibilitychange', ping);
}

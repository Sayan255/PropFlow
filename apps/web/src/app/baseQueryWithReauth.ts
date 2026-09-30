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

/** Direct fetch helper for auth endpoints (login/refresh cookie flow). */
export async function authFetch(path: string, body?: unknown, method = 'POST'): Promise<{ status: number; data: AuthResponse }> {
  const res = await fetch(`${API_ORIGIN}${AUTH_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: AuthResponse = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as AuthResponse;
    } catch {
      data = { error: { message: text } } as AuthResponse;
    }
  }
  return { status: res.status, data };
}

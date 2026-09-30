import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

/** Error envelope shape returned by auth-server and crm-api: { error: { code, message, details } }. */
export interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

type ApiErrorLike = FetchBaseQueryError & { data: ApiErrorEnvelope };

/** Narrows an unknown thrown/rejected value into our API error envelope, or null. */
export function asApiError(e: unknown): ApiErrorLike | null {
  if (typeof e !== 'object' || e === null || !('status' in e)) return null;
  const err = e as FetchBaseQueryError;
  if (typeof err.data !== 'object' || err.data === null) return null;
  return err as ApiErrorLike;
}

export function apiErrorMessage(e: unknown, fallback = 'Request failed'): string {
  return asApiError(e)?.data?.error?.message ?? fallback;
}

export function apiErrorCode(e: unknown): string | undefined {
  return asApiError(e)?.data?.error?.code;
}

export function apiErrorStatus(e: unknown): number | undefined {
  const status = asApiError(e)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function apiErrorDetails(e: unknown): Record<string, unknown> | undefined {
  return asApiError(e)?.data?.error?.details;
}

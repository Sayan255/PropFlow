import { createApi } from '@reduxjs/toolkit/query/react';
import type { Role } from '@propflow/shared';
import { baseQueryWithReauth } from '../baseQueryWithReauth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth('/auth-api'),
  tagTypes: ['Users', 'Invites', 'SecurityEvents'],
  endpoints: (build) => ({
    login: build.mutation({
      queryFn: async (body: { email: string; password: string }, _api, _opts, baseQuery) => {
        const result = await baseQuery({ url: '/auth/login', method: 'POST', body });
        if (result.error) return { error: result.error as never };
        return { data: result.data };
      },
    }),
    registerTenant: build.mutation({
      query: (body) => ({ url: '/auth/register-tenant', method: 'POST', body }),
    }),
    invite: build.mutation({
      query: (body) => ({ url: '/auth/invite', method: 'POST', body }),
      invalidatesTags: ['Invites'],
    }),
    acceptInvite: build.mutation({
      query: (body) => ({ url: '/auth/acceptinvite', method: 'POST', body }),
    }),
    logout: build.mutation({
      queryFn: async () => {
        await fetch('/auth-api/auth/logout', { method: 'POST', credentials: 'include' });
        return { data: true };
      },
      invalidatesTags: ['Users', 'Invites'],
    }),
    logoutAll: build.mutation({
      query: () => ({ url: '/auth/logoutall', method: 'POST' }),
    }),
    users: build.query<{ data: SessionUser[] }, void>({
      query: () => ({ url: '/crm-api/users', method: 'GET' }),
      providesTags: ['Users'],
    }),
    changeRole: build.mutation({
      query: ({ id, role }: { id: string; role: string }) => ({
        url: `/crm-api/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Users'],
    }),
    setUserStatus: build.mutation({
      query: ({ id, status }: { id: string; status: string }) => ({
        url: `/crm-api/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Users'],
    }),
    securityEvents: build.query<{ events: unknown[] }, void>({
      query: () => '/admin/security/events',
      providesTags: ['SecurityEvents'],
    }),
    rotateKeys: build.mutation({
      query: () => ({ url: '/admin/rotate-keys', method: 'POST' }),
      invalidatesTags: ['SecurityEvents'],
    }),
    createTenant: build.mutation({
      query: (body) => ({ url: '/admin/platform/tenants', method: 'POST', body }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterTenantMutation,
  useInviteMutation,
  useAcceptInviteMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useUsersQuery,
  useChangeRoleMutation,
  useSetUserStatusMutation,
  useSecurityEventsQuery,
  useRotateKeysMutation,
  useCreateTenantMutation,
} = authApi;

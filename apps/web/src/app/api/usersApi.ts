import { createApi } from '@reduxjs/toolkit/query/react';
import type { SessionUser } from './authApi';
import { baseQueryWithReauth } from '../baseQueryWithReauth';

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: baseQueryWithReauth('/crm-api'),
  tagTypes: ['Users'],
  endpoints: (build) => ({
    users: build.query<{ data: SessionUser[] }, void>({
      query: () => '/users',
      providesTags: ['Users'],
    }),
    changeRole: build.mutation({
      query: ({ id, role }: { id: string; role: string }) => ({
        url: `/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Users'],
    }),
    setUserStatus: build.mutation({
      query: ({ id, status }: { id: string; status: string }) => ({
        url: `/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Users'],
    }),
  }),
});

export const { useUsersQuery, useChangeRoleMutation, useSetUserStatusMutation } = usersApi;

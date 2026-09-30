import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '../baseQueryWithReauth';

export const masterDataApi = createApi({
  reducerPath: 'masterDataApi',
  baseQuery: baseQueryWithReauth('/crm-api'),
  tagTypes: ['MasterData'],
  endpoints: (build) => ({
    list: build.query<{ data: MasterItem[] }, { kind?: string } | void>({
      query: (params) => `/master-data${params && params.kind ? `?kind=${params.kind}` : ''}`,
      providesTags: ['MasterData'],
    }),
    create: build.mutation<MasterItem, Partial<MasterItem>>({
      query: (body) => ({ url: '/master-data', method: 'POST', body }),
      invalidatesTags: ['MasterData'],
    }),
    update: build.mutation<MasterItem, { id: string } & Partial<MasterItem>>({
      query: ({ id, ...body }) => ({ url: `/master-data/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['MasterData'],
    }),
    remove: build.mutation<void, string>({
      query: (id) => ({ url: `/master-data/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MasterData'],
    }),
  }),
});

export interface MasterItem {
  id: string;
  kind: 'PROPERTY_TYPE' | 'LOCALITY' | 'STATUS' | 'AMENITY';
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
}

export const { useListQuery: useMasterDataQuery, useCreateMutation: useMasterCreateMutation, useUpdateMutation: useMasterUpdateMutation, useRemoveMutation: useMasterRemoveMutation } = masterDataApi;

export const siteVisitsApi = createApi({
  reducerPath: 'siteVisitsApi',
  baseQuery: baseQueryWithReauth('/crm-api'),
  tagTypes: ['Visit'],
  endpoints: (build) => ({
    list: build.query<{ data: VisitDto[] }, { from?: string; to?: string; propertyId?: string } | void>({
      query: (params) => {
        const sp = new URLSearchParams();
        if (params?.from) sp.set('from', params.from);
        if (params?.to) sp.set('to', params.to);
        if (params?.propertyId) sp.set('propertyId', params.propertyId);
        const q = sp.toString();
        return `/site-visits${q ? `?${q}` : ''}`;
      },
      providesTags: ['Visit'],
    }),
    create: build.mutation<VisitDto, { propertyId: string; visitAtUtc: string }>({
      query: (body) => ({ url: '/site-visits', method: 'POST', body }),
      invalidatesTags: ['Visit'],
    }),
    update: build.mutation<VisitDto, { id: string; visitAtUtc?: string; outcome?: string }>({
      query: ({ id, ...body }) => ({ url: `/site-visits/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Visit'],
    }),
  }),
});

export interface VisitDto {
  id: string;
  propertyId: string;
  agentId: string;
  visitAtUtc: string;
  remindedAt: string | null;
  outcome: string;
}

export const { useListQuery: useSiteVisitsQuery, useCreateMutation: useVisitCreateMutation, useUpdateMutation: useVisitUpdateMutation } = siteVisitsApi;

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: baseQueryWithReauth('/crm-api'),
  endpoints: (build) => ({
    get: build.query<
      {
        kpis: { totalListings: number; activeListings: number; siteVisits: number; closedCount: number; closedValueInr: string };
        listingsOverTime: { day: string; count: number }[];
        funnel: { status: string; count: number }[];
        propertyTypeSplit: { type: string; count: number }[];
        agentLeaderboard: { agentId: string; closedCount: number; closedValueInr: string }[];
        cached?: boolean;
      },
      { from?: string; to?: string } | void
    >({
      query: (params) => {
        const sp = new URLSearchParams();
        if (params?.from) sp.set('from', params.from);
        if (params?.to) sp.set('to', params.to);
        const q = sp.toString();
        return `/dashboard${q ? `?${q}` : ''}`;
      },
    }),
  }),
});

export const { useGetQuery: useDashboardQuery } = dashboardApi;

export const platformApi = createApi({
  reducerPath: 'platformApi',
  baseQuery: baseQueryWithReauth('/auth-api'),
  endpoints: (build) => ({
    tenants: build.query<{ tenants: TenantRow[] }, void>({
      query: () => '/admin/platform/tenants',
    }),
  }),
});

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  userCount: number;
  adminCount: number;
  propertyCount: number;
}

export const { useTenantsQuery } = platformApi;

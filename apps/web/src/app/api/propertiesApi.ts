import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '../baseQueryWithReauth';

export interface PropertyRow {
  id: string;
  title: string;
  listingType: 'Sale' | 'Rent';
  bhk: number;
  propertyType: string;
  status: string;
  buildingName: string;
  unitNo: string;
  locality: string;
  city: string;
  priceInr: string;
  carpetAreaSqft: number;
  assigneeId: string | null;
  version: number;
  isStale: boolean;
  ownerPhone?: string;
  ownerPhoneVisible?: boolean;
  amenities?: string[];
  furnishing?: string;
  address?: string | null;
  floor?: number;
  totalFloors?: number;
  ownerName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function propertyQueryString(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const propertiesApi = createApi({
  reducerPath: 'propertiesApi',
  baseQuery: baseQueryWithReauth('/crm-api'),
  tagTypes: ['Property', 'PropertyList'],
  endpoints: (build) => ({
    list: build.query<{ data: PropertyRow[]; meta: { page: number; pageSize: number; total: number } }, Record<string, unknown>>({
      query: (params) => `/properties${propertyQueryString(params)}`,
      providesTags: (result) =>
        result
          ? [...result.data.map((p) => ({ type: 'Property' as const, id: p.id })), { type: 'PropertyList' as const, id: 'LIST' }]
          : [{ type: 'PropertyList' as const, id: 'LIST' }],
    }),
    detail: build.query<
      {
        property: PropertyRow;
        notes: { id: string; userId: string; body: string; createdAt: string }[];
        visits: { id: string; agentId: string; visitAtUtc: string; outcome: string }[];
        activities: { id: string; userId: string; changedFields: Record<string, { old?: unknown; new?: unknown }>; createdAt: string }[];
      },
      string
    >({
      query: (id) => `/properties/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Property', id }],
    }),
    create: build.mutation<PropertyRow, Record<string, unknown>>({
      query: (body) => ({ url: '/properties', method: 'POST', body }),
      invalidatesTags: [{ type: 'PropertyList', id: 'LIST' }],
    }),
    update: build.mutation<PropertyRow, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `/properties/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Property', id }, { type: 'PropertyList', id: 'LIST' }],
    }),
    remove: build.mutation<void, string>({
      query: (id) => ({ url: `/properties/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'PropertyList', id: 'LIST' }],
    }),
    bulk: build.mutation<{ updated: number }, { ids: string[]; operation: Record<string, unknown> }>({
      query: (body) => ({ url: '/properties/bulk', method: 'POST', body }),
      invalidatesTags: [{ type: 'PropertyList', id: 'LIST' }],
    }),
  }),
});

export const {
  useListQuery,
  useDetailQuery,
  useCreateMutation,
  useUpdateMutation,
  useRemoveMutation,
  useBulkMutation,
} = propertiesApi;

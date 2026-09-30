import { z } from 'zod';
import {
  FURNISHING_VALUES,
  LISTING_TYPES,
  MASTER_KINDS,
  PROPERTY_TYPES,
  STATUS_VALUES,
  VISIT_OUTCOMES,
  type PropertyStatus,
} from '../roles.ts';
import { INDIAN_MOBILE_RE, slugify, maskPhone } from '../utils/index.ts';

export { INDIAN_MOBILE_RE, slugify, maskPhone };

/* ── Shared primitives ───────────────────────────────────────────────────── */

export const idSchema = z.string().uuid();
export const bigIntIdSchema = z.union([z.string().regex(/^\d+$/), z.number().int()]);

export const enumSchema = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values);

export const propertyStatusSchema = z.enum(STATUS_VALUES);
export const listingTypeSchema = z.enum(LISTING_TYPES);
export const propertyTypeSchema = z.enum(PROPERTY_TYPES);
export const furnishingSchema = z.enum(FURNISHING_VALUES);
export const bhkSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export const roleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT']);

export const indianPhoneSchema = z
  .string()
  .trim()
  .regex(INDIAN_MOBILE_RE, 'Must be a valid Indian mobile number (10 digits starting 6-9)');

/* ── Auth ────────────────────────────────────────────────────────────────── */

export const registerTenantSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/, '3–40 chars, lowercase letters, numbers and hyphens'),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z
    .string()
    .min(10, 'At least 10 characters')
    .max(128)
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a digit'),
});
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']),
  name: z.string().trim().min(2).max(120).optional(),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10).max(512),
  name: z.string().trim().min(2).max(120),
  password: z
    .string()
    .min(10, 'At least 10 characters')
    .max(128)
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a digit'),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/* ── Property ────────────────────────────────────────────────────────────── */

export const MAX_PRICE_RENT_INR = 200_000; // ₹2 Lakh / month
export const MAX_PRICE_SALE_INR = 50_000_000; // ₹5 Crore

export const propertyBaseSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(160),
  listingType: listingTypeSchema,
  bhk: bhkSchema,
  furnishing: furnishingSchema,
  status: propertyStatusSchema.default('Draft'),
  propertyType: propertyTypeSchema,
  buildingName: z.string().trim().min(1, 'Required').max(120),
  unitNo: z.string().trim().min(1, 'Required').max(30),
  floor: z.number().int().min(-2).max(200),
  totalFloors: z.number().int().min(0).max(200),
  locality: z.string().trim().min(1, 'Required').max(120),
  city: z.string().trim().min(1, 'Required').max(80),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  ownerName: z.string().trim().min(2, 'At least 2 characters').max(120),
  ownerPhone: indianPhoneSchema,
  priceInr: z
    .number({ invalid_type_error: 'Price is required' })
    .int('Price must be a whole number of rupees')
    .positive('Price must be greater than 0')
    .max(2_000_000_000),
  carpetAreaSqft: z
    .number({ invalid_type_error: 'Carpet area is required' })
    .positive('Area must be greater than 0')
    .max(1_000_000),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  assigneeId: z.string().uuid().nullable().optional(),
});

export const propertyCreateSchema = propertyBaseSchema.superRefine((val, ctx) => {
  if (val.floor > val.totalFloors) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['floor'], message: 'Floor cannot exceed total floors' });
  }
  const max = val.listingType === 'Rent' ? MAX_PRICE_RENT_INR : MAX_PRICE_SALE_INR;
  if (val.priceInr > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priceInr'],
      message: val.listingType === 'Rent' ? 'Rent exceeds ₹2 Lakh/month' : 'Price exceeds ₹5 Crore',
    });
  }
});
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

export const propertyUpdateSchema = propertyBaseSchema.partial().extend({
  version: z.number({ invalid_type_error: 'version is required for updates' }).int().positive(),
});
export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

export const propertyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'price', 'carpetAreaSqft', 'title', 'status', 'locality'])
    .default('updatedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().optional(),
  listingType: z.enum(['Sale', 'Rent']).optional(),
  propertyType: z.string().optional(),
  bhk: z.coerce.number().int().min(0).max(5).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  areaMin: z.coerce.number().min(0).optional(),
  areaMax: z.coerce.number().min(0).optional(),
  locality: z.string().optional(),
  agentId: z.string().uuid().optional(),
  amenities: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  q: z.string().trim().max(120).optional(),
});
export type PropertyQuery = z.infer<typeof propertyQuerySchema>;

/* ── Bulk ────────────────────────────────────────────────────────────────── */

export const bulkOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('status'), status: propertyStatusSchema }),
  z.object({ op: z.literal('reassign'), assigneeId: z.string().uuid().nullable() }),
  z.object({ op: z.literal('amenity'), add: z.array(z.string()).default([]), remove: z.array(z.string()).default([]) }),
]);

export const bulkRequestSchema = z.object({
  ids: z.array(bigIntIdSchema).min(1).max(500),
  operation: bulkOperationSchema,
});
export type BulkRequest = z.infer<typeof bulkRequestSchema>;

/* ── Master data ─────────────────────────────────────────────────────────── */

export const masterDataItemSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(MASTER_KINDS),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});
export type MasterDataItem = z.infer<typeof masterDataItemSchema>;

export const masterDataCreateSchema = masterDataItemSchema.omit({ id: true });
export const masterDataUpdateSchema = masterDataItemSchema.partial().omit({ kind: true });

/* ── Site visits ─────────────────────────────────────────────────────────── */

const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/, 'Expected ISO date-time');

export const siteVisitCreateSchema = z.object({
  propertyId: bigIntIdSchema,
  visitAtUtc: utcDate,
  notes: z.string().max(500).optional(),
});
export type SiteVisitCreate = z.infer<typeof siteVisitCreateSchema>;

export const siteVisitUpdateSchema = z.object({
  visitAtUtc: utcDate.optional(),
  outcome: z.enum(VISIT_OUTCOMES).optional(),
  notes: z.string().max(500).optional(),
});
export type SiteVisitUpdate = z.infer<typeof siteVisitUpdateSchema>;

/* ── Chat ────────────────────────────────────────────────────────────────── */

export const chatSendSchema = z.object({
  propertyId: bigIntIdSchema,
  clientMsgId: z.string().min(6).max(64),
  body: z.string().trim().min(1).max(2000),
});
export type ChatSend = z.infer<typeof chatSendSchema>;

/* ── Dashboard ───────────────────────────────────────────────────────────── */

export const dashboardQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const FUNNEL_STATUSES: readonly PropertyStatus[] = ['Draft', 'Listed', 'SiteVisit', 'Negotiation', 'Closed'];

export function pricePerSqft(priceInr: number, areaSqft: number): number {
  if (!areaSqft || areaSqft <= 0) return 0;
  return Math.round(priceInr / areaSqft);
}

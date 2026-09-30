/* Canonical roles, pipeline statuses and permission matrix shared by web + crm-api. */

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const STATUS_VALUES = [
  'Draft',
  'Listed',
  'SiteVisit',
  'Negotiation',
  'Closed',
  'Withdrawn',
] as const;
export type PropertyStatus = (typeof STATUS_VALUES)[number];

export const TERMINAL_STATUSES: readonly PropertyStatus[] = ['Closed', 'Withdrawn'];

export const LISTING_TYPES = ['Sale', 'Rent'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const PROPERTY_TYPES = ['Apartment', 'Villa', 'Plot', 'Commercial'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const FURNISHING_VALUES = ['Unfurnished', 'Semi-Furnished', 'Furnished'] as const;
export type Furnishing = (typeof FURNISHING_VALUES)[number];

export const BHK_VALUES = [0, 1, 2, 3, 4, 5] as const;
export type Bhk = (typeof BHK_VALUES)[number];

export const VISIT_OUTCOMES = ['Scheduled', 'Completed', 'NoShow', 'Cancelled'] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export const MASTER_KINDS = ['PROPERTY_TYPE', 'LOCALITY', 'STATUS', 'AMENITY'] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

/* ── Permissions ─────────────────────────────────────────────────────────── */

export const PERMISSIONS = [
  'dashboard:view',
  'property:listAll',
  'property:create',
  'property:updateAny',
  'property:delete',
  'property:bulk',
  'property:export',
  'property:reassign',
  'property:notes',
  'property:chat',
  'property:visits',
  'masterdata:manage',
  'users:manage',
  'invite:create',
  'platform:tenants',
  'platform:security',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ['platform:tenants', 'platform:security', 'dashboard:view'],
  ADMIN: [
    'dashboard:view',
    'property:listAll',
    'property:create',
    'property:updateAny',
    'property:delete',
    'property:bulk',
    'property:export',
    'property:reassign',
    'property:notes',
    'property:chat',
    'property:visits',
    'masterdata:manage',
    'users:manage',
    'invite:create',
  ],
  MANAGER: [
    'dashboard:view',
    'property:listAll',
    'property:create',
    'property:updateAny',
    'property:notes',
    'property:chat',
    'property:visits',
    'property:bulk',
    'property:export',
    'property:reassign',
  ],
  AGENT: [
    'property:create',
    'property:notes',
    'property:chat',
    'property:visits',
  ],
};

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/* ── Navigation & routes (single source of truth for guards + sidebar) ───── */

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  permission?: Permission;
  superAdminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', permission: 'dashboard:view' },
  { label: 'Properties', path: '/properties', icon: 'apartment', permission: 'property:listAll' },
  { label: 'My Properties', path: '/my-properties', icon: 'home_work', permission: 'property:chat' },
  { label: 'Site Visits', path: '/site-visits', icon: 'event', permission: 'property:visits' },
  { label: 'Users', path: '/admin/users', icon: 'group', permission: 'users:manage' },
  { label: 'Master Data', path: '/admin/master-data', icon: 'tune', permission: 'masterdata:manage' },
  { label: 'Tenants', path: '/platform/tenants', icon: 'domain', permission: 'platform:tenants', superAdminOnly: true },
  { label: 'Security', path: '/platform/security', icon: 'security', permission: 'platform:security', superAdminOnly: true },
];

export const ROLE_ROUTES: Record<Role, string[]> = {
  SUPER_ADMIN: [
    '/platform/tenants',
    '/platform/security',
    '/dashboard',
    '/properties',
    '/properties/:id',
    '/403',
    '/404',
  ],
  ADMIN: [
    '/dashboard',
    '/properties',
    '/properties/new',
    '/properties/:id',
    '/site-visits',
    '/admin/users',
    '/admin/master-data',
    '/my-properties',
    '/403',
    '/404',
  ],
  MANAGER: [
    '/dashboard',
    '/properties',
    '/properties/new',
    '/properties/:id',
    '/site-visits',
    '/my-properties',
    '/403',
    '/404',
  ],
  AGENT: ['/properties', '/properties/new', '/properties/:id', '/site-visits', '/my-properties', '/403', '/404'],
};

export const PUBLIC_ROUTES = ['/login', '/register', '/invite/accept', '/403', '/404'];

export const DEFAULT_LANDING_BY_ROLE: Record<Role, string> = {
  SUPER_ADMIN: '/platform/tenants',
  ADMIN: '/dashboard',
  MANAGER: '/dashboard',
  AGENT: '/my-properties',
};

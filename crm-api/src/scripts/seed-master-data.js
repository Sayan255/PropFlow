import { MasterDataItem } from '../models.js';

export const DEFAULT_AMENITIES = [
  'Lift', 'Power Backup', 'Parking', 'Security', 'Gym', 'Swimming Pool',
  'Clubhouse', 'Garden', 'Vastu Compliant', 'Servant Room', 'Piped Gas', 'Water Supply 24x7',
];

export const DEFAULT_LOCALITIES = [
  'Bandra West', 'Andheri East', 'Powai', 'Worli', 'Lower Parel', 'Juhu',
  'Khar West', 'Malad West', 'Goregaon East', 'Chembur',
  'Whitefield', 'Koramangala', 'Indiranagar', 'HSR Layout', 'Jayanagar',
  'Sector 62 Noida', 'Golf Course Road', 'DLF Phase 3', 'Sushant Lok', 'Sohna Road',
];

/** Idempotent default master data for a tenant. */
export async function seedDefaultMasterData(tenantIds = null) {
  const tenants = tenantIds ?? [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  for (const tenantId of tenants) {
    const existing = await MasterDataItem.count({ where: { tenantId } });
    if (existing > 0) continue;
    const rows = [];
    const types = ['Apartment', 'Villa', 'Plot', 'Commercial'];
    types.forEach((t, i) => rows.push({ tenantId, kind: 'PROPERTY_TYPE', label: t, value: t, sortOrder: i, active: true }));
    const statuses = ['Draft', 'Listed', 'SiteVisit', 'Negotiation', 'Closed', 'Withdrawn'];
    statuses.forEach((s, i) => rows.push({ tenantId, kind: 'STATUS', label: s, value: s, sortOrder: i, active: true }));
    DEFAULT_LOCALITIES.forEach((l, i) => rows.push({ tenantId, kind: 'LOCALITY', label: l, value: l, sortOrder: i, active: true }));
    DEFAULT_AMENITIES.forEach((a, i) => rows.push({ tenantId, kind: 'AMENITY', label: a, value: a, sortOrder: i, active: true }));
    await MasterDataItem.bulkCreate(rows);
  }
}

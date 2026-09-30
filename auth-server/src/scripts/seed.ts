import { Tenant, User, sequelize } from '../db/models.ts';
import { hashPassword } from '../services/tenant-service.ts';
import { logger } from '../logger.ts';

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT';
}

const TENANTS: Array<{ id: string; name: string; slug: string; users: SeedUser[] }> = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Skyline Realty',
    slug: 'tenant-a',
    users: [
      { id: '11111111-1111-4111-8111-0000000000a1', email: 'admin@tenant-a.local', name: 'Aarav Admin', role: 'ADMIN' },
      { id: '11111111-1111-4111-8111-0000000000a2', email: 'manager@tenant-a.local', name: 'Meera Manager', role: 'MANAGER' },
      { id: '11111111-1111-4111-8111-0000000000a3', email: 'agent1@tenant-a.local', name: 'Arjun Agent', role: 'AGENT' },
      { id: '11111111-1111-4111-8111-0000000000a4', email: 'agent2@tenant-a.local', name: 'Ananya Agent', role: 'AGENT' },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Metro Homes',
    slug: 'tenant-b',
    users: [
      { id: '22222222-2222-4222-8222-0000000000b1', email: 'admin@tenant-b.local', name: 'Bharat Admin', role: 'ADMIN' },
      { id: '22222222-2222-4222-8222-0000000000b2', email: 'manager@tenant-b.local', name: 'Bhavna Manager', role: 'MANAGER' },
      { id: '22222222-2222-4222-8222-0000000000b3', email: 'agent1@tenant-b.local', name: 'Bilal Agent', role: 'AGENT' },
      { id: '22222222-2222-4222-8222-0000000000b4', email: 'agent2@tenant-b.local', name: 'Banita Agent', role: 'AGENT' },
    ],
  },
];

const SUPER_ADMIN_ID = '00000000-0000-4000-8000-000000000001';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function seedAuth(): Promise<void> {
  const password = process.env.SEED_PASSWORD ?? 'Password123!';
  const passwordHash = await hashPassword(password);

  await sequelize.transaction(async (t) => {
    await User.upsert(
      {
        id: SUPER_ADMIN_ID,
        tenantId: null,
        email: process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@propflow.local',
        name: 'Platform Super Admin',
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      { transaction: t },
    );

    for (const spec of TENANTS) {
      await Tenant.upsert({ id: spec.id, name: spec.name, slug: spec.slug, status: 'ACTIVE' }, { transaction: t });
      for (const u of spec.users) {
        if (!isUuid(u.id)) throw new Error(`Bad seed uuid: ${u.id}`);
        await User.upsert(
          {
            id: u.id,
            tenantId: spec.id,
            email: u.email,
            name: u.name,
            passwordHash,
            role: u.role,
            status: 'ACTIVE',
          },
          { transaction: t },
        );
      }
    }
  });
  logger.info('auth seed complete (1 super admin, 2 tenants, 8 tenant users)');
}

export const SEED_TENANT_A_ID = TENANTS[0]!.id;
export const SEED_TENANT_B_ID = TENANTS[1]!.id;

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAuth()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'seed failed');
      process.exit(1);
    });
}

import bcrypt from 'bcryptjs';
import { Tenant, User, sequelize } from '../db/models.ts';
import { conflict } from '../http/errors.ts';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Creates tenant + first ADMIN user atomically. */
export async function registerTenant(input: {
  companyName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}): Promise<{ tenant: Tenant; admin: User }> {
  const existingTenant = await Tenant.findOne({ where: { slug: input.slug } });
  if (existingTenant) throw conflict('Slug already taken', { field: 'slug' });
  const existingUser = await User.findOne({ where: { email: input.adminEmail } });
  if (existingUser) throw conflict('Email already registered', { field: 'adminEmail' });

  const passwordHash = await hashPassword(input.adminPassword);
  return sequelize.transaction(async (t) => {
    const tenant = await Tenant.create(
      { name: input.companyName, slug: input.slug, status: 'ACTIVE' },
      { transaction: t },
    );
    const admin = await User.create(
      {
        tenantId: tenant.id,
        email: input.adminEmail,
        name: input.adminName,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      { transaction: t },
    );
    return { tenant, admin };
  });
}

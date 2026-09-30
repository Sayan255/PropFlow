import { QueryInterface, QueryTypes } from 'sequelize';
import { sequelize } from './db/models.ts';
import { up as up001 } from './migrations/001_init.ts';

const MIGRATIONS: Array<{ name: string; up: (qi: QueryInterface) => Promise<void> }> = [{ name: '001_init', up: up001 }];

/** Runs pending migrations; records applied ones in migration_meta. */
export async function migrate(): Promise<void> {
  const qi = sequelize.getQueryInterface();
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS migration_meta (
      name VARCHAR(190) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL
    )`,
  );
  const applied = new Set(
    (await sequelize.query<{ name: string }>('SELECT name FROM migration_meta', { type: QueryTypes.SELECT })).map(
      (r) => r.name,
    ),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    await sequelize.transaction(async (t) => {
      await m.up(qi);
      await sequelize.query('INSERT INTO migration_meta (name, applied_at) VALUES (:name, NOW(3))', {
        replacements: { name: m.name },
        transaction: t,
      });
    });
  }
}

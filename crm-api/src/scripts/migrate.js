import { sequelize } from '../db.js';
import { createDatabase } from './db-create.js';
import { logger } from '../logger.js';
import { seedDefaultMasterData } from './seed-master-data.js';

/**
 * PropFlow schema decision: Sequelize model definitions are the single source of truth
 * and `sequelize.sync()` (safe, additive) applies them. See DECISIONS.md — with one more
 * week this becomes versioned umzug migrations.
 */
export async function migrate() {
  await sequelize.sync();
  await seedDefaultMasterData();
  logger.info('crm_db schema ready');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  createDatabase()
    .then(migrate)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

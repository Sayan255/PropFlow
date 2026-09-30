import { migrate } from '../migrate.ts';
import { createDatabase } from './db-create.ts';

createDatabase()
  .then(migrate)
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    /* eslint-disable-next-line no-console */
    console.error(err);
    process.exit(1);
  });

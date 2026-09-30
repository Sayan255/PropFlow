#!/bin/sh
# crm-api container entrypoint: create schema -> sync models -> idempotent seed -> run.
set -e

echo "[entrypoint] ensuring database exists"
node src/scripts/db-create.js
echo "[entrypoint] syncing schema + master data"
node src/scripts/migrate.js
echo "[entrypoint] seeding (idempotent; 10,482 properties on first run)"
node src/scripts/seed.js

exec node src/index.js

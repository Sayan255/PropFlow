#!/bin/sh
# auth-server container entrypoint:
#   1. generate RS256 dev keys if none mounted   2. create schema   3. migrate   4. run
set -e

if [ ! -f /app/keys/dev-private.pem ]; then
  echo "[entrypoint] generating dev signing keys"
  npx tsx src/scripts/generate-keys.ts
fi

echo "[entrypoint] ensuring database exists"
npx tsx src/scripts/db-create.ts
echo "[entrypoint] running migrations"
npx tsx src/scripts/migrate.ts
echo "[entrypoint] seeding demo accounts (idempotent)"
npx tsx src/scripts/seed.ts

exec npx tsx src/index.ts

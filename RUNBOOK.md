# PropFlow — Runbook

Day-2 operations for people running PropFlow. See README.md for first-time setup.

## Ports & processes (local dev)

| Service | Port | Command | Health |
|---|---|---|---|
| web (Vite) | 5173 | `npm run dev -w apps/web` | `curl localhost:5173` |
| auth-server | 4001 | `npm run dev -w auth-server` | `curl localhost:4001/health` |
| crm-api | 4002 | `npm run dev -w crm-api` | `curl localhost:4002/health` |
| MySQL | 3306 | system service | `mysql -upropflow -p -h127.0.0.1` |
| Redis | 6379 | system service | `redis-cli ping` |

`/health` returns `200 {"status":"ok",...}` when MySQL + Redis + JWKS are reachable, `503 {"status":"degraded"}` with per-dependency flags otherwise. Docker healthchecks use the same endpoints.

## Docker Compose operations

```bash
docker compose up -d --build            # build + start all
docker compose ps                       # all services should be healthy
docker compose logs -f auth crm-api     # tail app logs
docker compose up -d --scale crm-api=2  # add a CRM replica (nginx round-robins)
docker compose down                     # stop (keeps volumes)
docker compose down -v                  # stop + wipe data (fresh seed next up)
```

First boot order is handled by healthchecks and entrypoints: MySQL/Redis healthy → auth generates keys + migrates → crm syncs schema + seeds (idempotent, ~minutes for 10,482 properties) → nginx routes. `ENABLE_CRON=false` is set for crm in compose so replicas don't double-fire reminders; enable it if you run a single replica and want the scheduler.

## Routine procedures

### Reset seed data
```bash
# Docker:
docker compose down -v && docker compose up -d --build
# Local:
mysql -upropflow -p -e "DROP DATABASE crm_db; DROP DATABASE auth_db;"
npm run db:migrate && npm run db:seed
```
Seeding is idempotent — re-running `db:seed` never duplicates; it skips when the expected row counts already exist.

### Rotate JWT signing keys (auth)
```bash
# Local dev: regenerate the dev keypair (old tokens invalid immediately)
npm run keys:generate -w auth-server && npm run dev:auth
```
In production, set new `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (PEM, `\n`-escaped) + `JWT_KEY_ID`, then restart auth. The key is published in JWKS with a grace window (`JWT_OLD_KEY_GRACE_SECONDS`, default 3600) so tokens signed by the previous key verify until expiry. Rotate by generating a new key, verifying JWKS shows both, then removing the old one.

### Revoke every session for a user (incident)
```bash
# SUPER_ADMIN: POST /auth-api/auth/logoutall with that user's credentials, or as admin via UI (Users page → Logout all sessions).
# Redis-level (break-glass):
redis-cli --scan --pattern 'rtfam:*'          # refresh families
redis-cli --scan --pattern 'rt:*' | xargs redis-cli del   # nuclear: all refresh tokens
```
Users are also recorded in the `security:events` Redis log by auth-server (`GET /auth-api/admin/security/events`, SUPER_ADMIN Security console).

### Invite a user
UI: Users page → Invite (role + email) → copy the link. The link is single-use and expires after `INVITE_TTL_HOURS` (24h default). Expired/used tokens return 410/409 from `/auth/acceptinvite`.

### Inspect/clear dashboard cache
```bash
redis-cli --scan --pattern 'dash:*'                 # list cached aggregates (60s TTL)
redis-cli --scan --pattern 'dash:*' | xargs redis-cli del   # force refresh
```

### Login lockout (5 fails → 15 min)
Key: `rl:login:{ip}:{email}`. To clear one user during a demo: `redis-cli del "rl:login:127.0.0.1:admin@tenant-a.local"`. 429 responses carry `Retry-After`.

## Verification without local infra

This repo was developed on a machine without MySQL/Redis/Docker. To run the full verification anywhere that has Docker:

```bash
docker run -d --name pf-mysql -e MYSQL_ROOT_PASSWORD=root-dev-password -e MYSQL_USER=propflow -e MYSQL_PASSWORD=propflow-dev-password -p 3306:3306 mysql:8.4
docker run -d --name pf-redis -p 6379:6379 redis:7-alpine
npm install
npm run keys:generate -w auth-server
npm run test:integration -w auth-server
npm run test:integration -w crm-api
npm run db:migrate && npm run db:seed
npm run build -w apps/web
npm run dev:auth   # shell 1
npm run dev:crm    # shell 2
npm run dev:web    # shell 3
```
Or simply `docker compose up -d --build` and exercise the app on http://localhost:8080.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| crm-api 503 `checks.jwks:false` | auth not reachable at `AUTH_JWKS_URL` → check auth health, restart crm after auth is up |
| Login always 401, no lockout | MySQL auth_db missing/empty → run `npm run db:migrate -w auth-server && npm run seed -w auth-server` |
| Properties list empty | seed skipped (already present with different counts) → check `docker compose logs crm-api` for "seed already present" |
| Socket.IO disconnects through proxies | missing websocket upgrade → nginx config includes `/crm-api/socket.io/` upgrade block; keep it when editing |
| 409 CONFLICT storm on a property | concurrent editors; expected — resolve per-field in the dialog (Theirs/Yours/save merged) |
| `Missing required env: …` at boot | a required env var is unset → copy `.env.example` → `.env`, or export compose env vars |
| Export 413 EXPORT_TOO_LARGE | result set exceeds `EXPORT_MAX_ROWS` → add filters; the cap protects memory by design |
| Clock skew "Token expired" right after login | server/client clocks differ >60s (access TTL) → sync clocks (`JWT_ACCESS_TTL` can be raised for dev) |

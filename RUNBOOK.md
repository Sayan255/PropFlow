# RUNBOOK.md — operating PropFlow

The day-2 document: what to check when something looks wrong, how to reset things safely, and the maintenance procedures (key rotation, seeds, lockouts). For first-time setup see the README; for why things are built this way see DECISIONS.md.

## What runs where

**Local dev** (three terminals + local MySQL/Redis):

| Service | Port | Start | Health |
|---|---|---|---|
| SPA (Vite) | 5173 | `npm run dev:web` | http://localhost:5173 |
| auth-server | 4001 | `npm run dev:auth` | `curl localhost:4001/health` |
| crm-api | 4002 | `npm run dev:crm` | `curl localhost:4002/health` |

The Vite server proxies `/auth-api/*` and `/crm-api/*` to the two backends, so the browser only ever talks to :5173.

**Docker Compose** — one public port, **:8080** (edge nginx); everything else is container-internal. `docker compose ps` should show every service healthy.

**Render** — one public URL (the `propflow-edge` web service); MySQL, Redis, auth, crm and the SPA are private services. Health checks run on `/health` (apps) and `/healthz` (edge).

## Health endpoints — read them before anything else

`/health` returns `200 {"status":"ok", ...}` only when **all** dependencies answer, and `503 {"status":"degraded", ...}` with a per-dependency breakdown otherwise. The fields tell you exactly which leg is broken:

| Field | False means |
|---|---|
| `mysql` | DB unreachable / wrong credentials / database missing |
| `redis` | Redis down — sessions, rate limits, dashboard cache and socket fan-out are all affected |
| `jwks` | crm-api can't fetch auth-server's public keys — every authenticated request will 401 |

The edge's `/healthz` only proves nginx is alive; the real status is always in the two app `/health` payloads.

## Routine procedures

### Reset everything to a fresh seed
```bash
# Compose:
docker compose down -v && docker compose up -d --build
# Local:
mysql -upropflow -p -e "DROP DATABASE auth_db; DROP DATABASE crm_db;"
npm run db:migrate && npm run db:seed
```
Seeding is **idempotent** — running it again on populated databases skips instead of duplicating. On Render, the entrypoints do migrate+seed on every deploy for the same reason.

### Rotate JWT signing keys
In-app (preferred, zero downtime): log in as `superadmin@propflow.local` → Security console → **Rotate keys**. The new `kid` publishes to JWKS immediately; tokens signed by the old key keep verifying for the grace window (`JWT_OLD_KEY_GRACE_SECONDS`, default 3600) so nobody gets logged out mid-hour.

Manually (env-based deployments like Render): generate a new RSA pair, update `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `JWT_KEY_ID`, redeploy auth, then crm — it refetches JWKS on the next unknown `kid`.

### Clear a login lockout (5 failed attempts → 15 min)
Rate-limit keys look like `rl:login:{ip}:{email}`:
```bash
redis-cli del "rl:login:127.0.0.1:admin@tenant-a.local"
```
If you're seeing 429s with a `Retry-After` header in a demo, this is why — it's the limiter working, not an outage.

### Kill all sessions for a user (incident)
First choice: SUPER_ADMIN → Users → logout-all for that user (or `POST /auth-api/auth/logoutall` with their credentials). Break-glass, nukes *every* session in the environment:
```bash
redis-cli --scan --pattern 'rt:*' | xargs redis-cli del
```
All security events land in the `security:events` Redis log, visible in the Security console (`GET /auth-api/admin/security/events`).

### Refresh the dashboard cache
Aggregates cache for 60s under `dash:*:{tenantId}`. Forcing a refresh:
```bash
redis-cli --scan --pattern 'dash:*' | xargs redis-cli del
```

### Invite a user
Users page → Invite (email + role) → copy the single-use link. It expires after `INVITE_TTL_HOURS` (24h default); used/expired links return 409/410 from `/auth/acceptinvite`.

## Cron jobs

| Job | Schedule (UTC) | IST | What it does | Guard |
|---|---|---|---|---|
| Visit reminders | `* * * * *` (every minute, 15-min look-ahead window) | — | reminders for visits starting within 15 min | Redis lock `lock:visit-reminder` |
| Stale property flag | `30 20 * * *` | 02:00 | flags properties untouched for `STALE_DAYS` (30) | per-row, idempotent |

Cron runs **inside crm-api** (not a separate scheduler), controlled by `ENABLE_CRON`. Rule: exactly **one** crm replica owns the scheduler — in compose it's on by default; on Render the blueprint sets `ENABLE_CRON=true` for the single replica. If you scale crm beyond one instance, set `ENABLE_CRON=false` everywhere else or reminders will double-fire (the lock makes this unlikely, but why risk it).

## Render-specific operations

- **Deploy**: push to the linked branch; auto-deploy is on. Manual: Dashboard → service → **Manual Deploy**.
- **First boot**: MySQL provisions `auth_db` + `crm_db` via the baked-in init script → auth seeds 9 accounts → crm seeds properties (500 by default there; `SEED_PROPERTIES_PER_TENANT=10482` for full assignment scale). 10–20 minutes total.
- **Secrets**: everything marked `sync: false` in `render.yaml` lives in the dashboard, not the repo. The JWT PEMs are `\n`-escaped single-line strings — see `docs/DEPLOY-RENDER.md` for the one-liner that produces them.
- **Backups**: MySQL dumps only (`mysqldump` from the service shell) — Render explicitly warns disk snapshots can restore corrupt DB state. Redis persistence (journal+snapshot) is fine to lose; it's sessions and caches.

## Verification without local infra

This repo was built on a machine without MySQL/Redis/Docker, so here's the fastest full verification on any machine that has Docker:
```bash
docker compose up -d --build      # everything: DBs, seeds, all services, edge on :8080
```
…or let CI do it — `.github/workflows/ci.yml` job 2 spins up MySQL + Redis service containers and runs both integration suites on every push.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `jwks:false` in crm `/health` | auth unreachable at `AUTH_JWKS_URL` → check auth health; restart crm after auth is up |
| Every login 401, no lockout counter | `auth_db` missing or empty → run auth migrate + seed; check auth logs for `[entrypoint] seeding` |
| Infinite refresh loop in the SPA | cookie not being sent → `CORS_ORIGIN`/`FRONTEND_URL` must match the browser origin **exactly** (scheme included); behind the edge, confirm the `/auth-api` prefix-strip is in place |
| Properties list empty | seed skipped as already-present with different counts → check crm logs for `seed already present` |
| Chat disconnects through proxies | websocket upgrade missing → the edge/compose nginx configs include the `Upgrade`/`Connection` headers; don't remove them |
| 409 CONFLICT on every property save | two editors, stale version — expected; resolve per-field in the dialog (Theirs/Yours → save merged) |
| `Missing required env: …` at boot | copy `.env.example` → `.env`, or export the compose/Render env vars |
| Export returns 413 `EXPORT_TOO_LARGE` | result set exceeds `EXPORT_MAX_ROWS` → narrow the filters; the cap protects memory by design |
| "Token expired" right after login | clock skew > 60s between client and server → sync clocks, or raise `JWT_ACCESS_TTL` in dev |
| 502 on one API prefix only | that pserv crashed → usually a bad PEM escape in `JWT_PRIVATE_KEY`; check its logs |

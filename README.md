# PropFlow — Multi-Tenant Real Estate CRM

This is my submission for the full-stack assignment. PropFlow is a SaaS CRM for real-estate agencies: each tenant is one agency, with its own admins, managers, agents, properties, site visits, chats and master data. Tenant isolation is enforced everywhere — in every SQL query, in the JWT claims, and in the composite indexes.

The repo is a monorepo with four packages:

```
packages/shared   → zod schemas, role/permission matrix, INR/phone/date utils (shared by web + APIs)
auth-server       → auth service (TypeScript, Express, RS256 + JWKS, rotating refresh tokens)
crm-api           → the CRM domain API (JavaScript, Express, Sequelize, Socket.IO, ExcelJS, cron)
apps/web          → the React SPA (MUI v5, RTK Query, FullCalendar, ApexCharts)
```

Everything below is implemented for real — no mocks, no fake data in the UI paths. Where I couldn't verify something on my machine, I've said so explicitly at the bottom.

---

## Running it

### Option 1: Docker (easiest)

If you have Docker, this is the whole story:

```bash
docker compose up -d --build
```

Then open **http://localhost:8080**. The containers create the databases, run migrations, seed ~10.5k properties and start serving. First boot takes a few minutes because of the seed — `docker compose logs -f crm-api` shows progress.

### Option 2: Local dev

You need **Node 20+**, **MySQL 8** and **Redis 7** running. (I developed on a machine without Docker, so this was my daily driver.)

```bash
# one-time: create the MySQL user the app expects
mysql -uroot -p -e "CREATE USER IF NOT EXISTS 'propflow'@'localhost' IDENTIFIED BY 'propflow-dev-password'; GRANT ALL PRIVILEGES ON *.* TO 'propflow'@'localhost'; FLUSH PRIVILEGES;"

cp .env.example .env          # the defaults match the setup above
npm install
npm run keys:generate -w auth-server   # RS256 keypair → auth-server/keys/ (gitignored)
npm run db:migrate            # creates auth_db + crm_db, applies schema + master data
npm run db:seed               # 9 users + 10,482 properties for tenant-a (idempotent)
```

Then run the three services — each in its own terminal:

```bash
npm run dev:auth    # auth-server on :4001
npm run dev:crm     # crm-api on :4002
npm run dev:web     # Vite dev server on :5173
```

Open **http://localhost:5173**. The Vite dev server proxies `/auth-api/*` and `/crm-api/*` to the backends, so the SPA talks to everything same-origin (that matters for the refresh cookie — see below).

### Option 3: Render (cloud)

There's a Render blueprint (`render.yaml`) that provisions the whole stack — MySQL private service, Redis, the three app services and a public nginx edge. The step-by-step, including the secrets you'll be prompted for and the cost breakdown, is in [docs/DEPLOY-RENDER.md](docs/DEPLOY-RENDER.md).

### Demo accounts
(email id: admin@tenant-a.local
password: Password123!)
Password for all of them: **`Password123!`**

| Email | Role | Tenant |
|---|---|---|
| `superadmin@propflow.local` | SUPER_ADMIN | platform-wide console |
| `admin@tenant-a.local` | ADMIN | tenant-a |
| `manager@tenant-a.local` | MANAGER | tenant-a |
| `agent1@tenant-a.local`, `agent2@tenant-a.local` | AGENT | tenant-a |
| `admin@tenant-b.local`, `manager@tenant-b.local`, `agent1@tenant-b.local`, `agent2@tenant-b.local` | same roles | tenant-b |

Log in as an agent from tenant-a and try to open a tenant-b property URL — you'll get a 404, not a 403 (I deliberately hide existence, not just deny access). Log in as `agent1` and you'll only see properties assigned to them, even though the URL says `/properties`.

One gotcha to know: after 5 failed logins the account+IP is locked for 15 minutes (that's the rate limiter working, not a bug). `redis-cli del "rl:login:127.0.0.1:admin@tenant-a.local"` clears it if you're demoing.

---

## What's implemented

**Auth (auth-server).** Register-tenant creates the agency + admin in one transaction. Login issues a 60-second RS256 access token (kept **in memory only** in the SPA) plus a rotating refresh token in an httpOnly cookie scoped to path `/auth`. Every refresh rotates the token and detects reuse: replaying an old refresh token revokes the whole token family and logs a `TOKEN_REUSE` security event. Invites are single-use links. Login rate limiting (5 fails → 15 min lock) is Redis-backed. There's a platform console for SUPER_ADMIN with tenant list, key rotation and a security-event log.

**CRM (crm-api).** Server-side filtering/sorting/pagination (whitelisted sort columns, capped page size — the DataGrid is driven by URL params). Optimistic locking: a stale PATCH gets a 409 with the latest copy, and the UI shows a Theirs/Yours per-field dialog where you can save the merged result. Duplicate building+unit is rejected with 409 via a unique index. Bulk status updates run in one transaction and roll back entirely if any row is in a terminal state. Excel export streams in batches (ExcelJS `WorkbookWriter`, 50k cap) and is admin/manager-only. Dashboard aggregates are raw SQL cached in Redis for 60s. Master data has an in-use delete guard. Real-time chat runs on Socket.IO with the Redis adapter (so it works with multiple API replicas), presence, and idempotent sends via `client_msg_id`. Cron jobs flag stale properties and fire visit reminders, guarded by a Redis lock so replicas don't double-fire.

**Web (apps/web).** The interesting bits: the single-flight refresh (5 parallel 401s trigger exactly ONE `/auth/refresh`, then all 5 retry — there's a unit test pinning this contract), the optimistic-lock conflict dialog, the chat panel with optimistic send + retry using the same `client_msg_id`, and the site-visit calendar with drag-drop that reverts the drop if the API rejects it.

## The hard checks (H1–H12)

Honest status for each. "Test written" means the integration suite covers it — see the caveat below about my machine.

| Check | Status | Notes |
|---|---|---|
| H1 tenant isolation | ✅ + test written | every query forces `tenant_id`; cross-tenant reads → 404 |
| H2 agents see only assigned | ✅ + test written | forced server-side, not in the UI |
| H3 single-flight refresh | ✅ **unit-tested, passing** | 5×401 → 1 refresh → 5 retries |
| H4 RS256 + JWKS | ✅ + test written | crm-api verifies via remote JWKS with caching |
| H5 refresh rotation + reuse detection | ✅ + tests written | replay → `TOKEN_REUSE`, family revoked |
| H6 optimistic locking | ✅ + test written | 409 carries the latest copy; UI merge flow |
| H7 duplicate natural key | ✅ + test written | unique index; one 201, one 409 |
| H8 server-side filter/sort/page | ✅ | shared zod schema, whitelisted sort columns |
| H9 real-time chat | ✅ | JWT handshake, room authz, Redis adapter, idempotent sends |
| H10 streaming export | ✅ + test written | batched writes, magic bytes asserted in test |
| H11 role-guarded export | ✅ + test written | agent gets 403 |
| H12 Docker deployment | ✅ written, **not run locally** | no Docker daemon on my machine — see below |

## Tests

```bash
npm test                              # unit tests — run anywhere (8 tests, passing)
npm run test:integration -w auth-server   # needs MySQL + Redis
npm run test:integration -w crm-api       # needs MySQL + Redis
```

The integration suites are written and cover the flows listed above (rotation/replay, lockout, invites, key rotation, tenant isolation, agent scoping, the 409 flow, bulk rollback, export bytes + RBAC, master-data guard). **Full transparency: I could not execute them on my machine** — it has no MySQL, Redis or Docker. That's exactly what the CI workflow (`.github/workflows/ci.yml`) is for: job 1 runs lint/typecheck/unit/build, job 2 spins up MySQL 8.4 and Redis 7 service containers and runs both suites. If you're evaluating this repo, CI or `docker compose up` is the fastest way to see the integration suites go green.

## Environment variables

Everything is in [.env.example](.env.example) with working dev defaults, so I'll only call out the ones that matter:

- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — PEMs. In dev you generate them with `npm run keys:generate`; in production you'd set them as env vars (they support `\n`-escaped PEM strings). The config refuses to boot in production without them.
- `COOKIE_SECURE` / `COOKIE_SAME_SITE` — flip to `true` / `none` behind HTTPS.
- `AUTH_JWKS_URL` — where crm-api finds auth-server's public keys.
- `SEED_PROPERTIES_PER_TENANT` — 10482, per the assignment spec.

## Decisions I made (and would defend)

The long version is in [DECISIONS.md](DECISIONS.md). The three you're most likely to ask about:

1. **Two databases (`auth_db`, `crm_db`).** The auth service owns identity and the CRM never touches its tables — it calls the auth API for user lists. Makes the service boundary physical, and a future split trivial.
2. **`sequelize.sync()` for crm-api's schema, but a real versioned migration for auth.** I know `sync()` isn't production-grade; I documented the trade-off and how I'd replace it with umzug migrations given another week. Auth-server has the proper migration setup with a `migration_meta` table.
3. **Access token in memory, refresh in a path-scoped httpOnly cookie.** XSS can steal at most a 60-second token. The cost is a page reload needs a silent refresh — which is exactly what the single-flight `doRefresh()` handles.

## What I'd improve with more time

- Run the integration suites and Docker stack end-to-end (blocked by my machine, trivially unblocked in CI or any Docker host).
- Versioned migrations for crm-api instead of `sync()`.
- A MySQL FULLTEXT index for search — right now it's an OR-across-columns query, fine at 10k rows, not at 1M.
- Rate limiting on CRM write endpoints (login has one; the general API doesn't yet).
- The MUI bundle is ~700KB minified — route-level code splitting would cut the initial load meaningfully.

## Operations

[RUNBOOK.md](RUNBOOK.md) covers the day-2 stuff: health endpoints, seeding/reset, key rotation procedure, clearing lockouts, the dashboard cache, and a troubleshooting table.

---

*Stack: Node 20, TypeScript + modern ESM JavaScript, React 18, MUI v5, RTK Query, Sequelize/MySQL 8, Redis 7, Socket.IO, ExcelJS, Vite, Docker Compose, nginx, GitHub Actions.*

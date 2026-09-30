# PropFlow — Multi-Tenant Real Estate CRM

Production-style, multi-tenant SaaS CRM for real-estate agencies. One tenant = one agency with its own administrators, managers, agents, properties, master data, site visits, notes, activities and chats. Strict tenant isolation is enforced in every query, index and token.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser SPA (React 18 + MUI v5 + RTK Query)                             │
│  /auth-api/* → Vite dev proxy or edge nginx        /crm-api/* → same     │
└──────────────┬───────────────────────────────────────┬───────────────────┘
               ▼                                       ▼
┌──────────────────────────────┐        ┌──────────────────────────────────┐
│ auth-server :4001 (TS)       │        │ crm-api :4002 (JS)               │
│ register-tenant/login/logout │        │ properties CRUD + list/export    │
│ refresh rotation + reuse det.│        │ optimistic locking (409+latest)  │
│ invites · RBAC keys · JWKS   │        │ bulk tx · master data · visits   │
│ login rate-limit (Redis)     │        │ dashboard agg (Redis-cached 60s) │
│ RS256, kid, key rotation     │        │ Socket.IO chat/presence/notes    │
│ security event log           │        │ cron: stale flag + visit remind  │
└──────┬──────────────┬────────┘        └──────┬──────────────┬────────────┘
       ▼              ▼                        ▼              ▼
   auth_db        Redis                  crm_db           Redis
  (MySQL 8)   rt:{sha256} rtfam:…       (MySQL 8)     dash:* · adapter
              rl:login:{ip}:{email}    locks · presence
              jwks cache
```

**Monorepo (npm workspaces)**

| Path | What |
|---|---|
| `packages/shared` | zod schemas, roles + permission matrix, INR/phone/IST utils (TS) |
| `auth-server` | Authentication/identity service (TypeScript, Express, RS256 + JWKS) |
| `crm-api` | CRM domain API (JavaScript, Express, Sequelize, Socket.IO, ExcelJS, cron) |
| `apps/web` | React SPA (MUI v5, RTK Query, FullCalendar, ApexCharts) |

---

## Quickstart (5 commands, local dev)

Requires **Node ≥ 20**, **MySQL 8**, **Redis 7** (no Docker needed):

```bash
cp .env.example .env                      # 1. defaults work for local dev
npm install                               # 2. install all workspaces
npm run keys:generate -w auth-server      # 3. RS256 dev keys → auth-server/keys/
npm run db:migrate && npm run db:seed     # 4. create schemas + seed (10,482 properties)
npm run dev                               # 5. three dev servers (run in separate shells:
                                          #    dev:auth / dev:crm / dev:web) → http://localhost:5173
```

## Quickstart (Docker Compose)

Requires only Docker. Builds, migrates, seeds and serves everything on **http://localhost:8080**:

```bash
docker compose up -d --build              # first run seeds ~10k properties (few minutes)
docker compose up -d --scale crm-api=2    # optional: 2 CRM replicas behind nginx
docker compose logs -f crm-api            # watch seed progress
```

## Seed credentials (password for all: `Password123!`)

| Email | Role | Tenant |
|---|---|---|
| `superadmin@propflow.local` | SUPER_ADMIN | platform |
| `admin@tenant-a.local` | ADMIN | tenant-a |
| `manager@tenant-a.local` | MANAGER | tenant-a |
| `agent1@tenant-a.local` / `agent2@tenant-a.local` | AGENT | tenant-a |
| `admin@tenant-b.local` | ADMIN | tenant-b |
| `manager@tenant-b.local` | MANAGER | tenant-b |
| `agent1@tenant-b.local` / `agent2@tenant-b.local` | AGENT | tenant-b |

Seed data: **10,482 properties** for tenant-a (+80 for tenant-b), site visits, notes and chats on 60 properties, default master data. Seeding is **idempotent** (re-running skips existing rows).

## Environment variables

Every variable with a default in [.env.example](.env.example) works locally without edits. Highlights:

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `MYSQL_HOST/PORT/USER/PASSWORD` | both servers | `127.0.0.1:3306` / `propflow` | shared MySQL server, two databases |
| `MYSQL_AUTH_DATABASE` / `MYSQL_CRM_DATABASE` | auth / crm | `auth_db` / `crm_db` | DB-per-service (see DECISIONS.md) |
| `REDIS_URL` | both servers | `redis://127.0.0.1:6379` | sessions, rate limits, caches, socket adapter |
| `AUTH_PORT` / `CRM_PORT` | auth / crm | `4001` / `4002` | |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `JWT_KEY_ID` | auth | — (falls back to `auth-server/keys/dev-*.pem`) | production must set PEMs (see DECISIONS.md) |
| `JWT_ACCESS_TTL` | auth | `60s` | short-lived access tokens; refresh via `pf_rt` cookie |
| `INVITE_TTL_HOURS` | auth | `24` | invite link validity |
| `COOKIE_SECURE` / `COOKIE_SAME_SITE` | auth | `false` / `lax` | production: `true` / `none` behind HTTPS |
| `AUTH_JWKS_URL` | crm | `http://127.0.0.1:4001/.well-known/jwks.json` | where crm-api fetches public keys |
| `CORS_ORIGIN` / `FRONTEND_URL` | both | `http://localhost:5173` | comma-separated allow-list |
| `EXPORT_MAX_ROWS` | crm | `50000` | Excel export cap (413 beyond) |
| `DASHBOARD_CACHE_TTL_SECONDS` | crm | `60` | dashboard aggregate cache |
| `SEED_PROPERTIES_PER_TENANT` | crm seed | `10482` | assignment-spec count |
| `ENABLE_CRON` | crm | on (off in compose) | visit reminders + stale flagging |

## Commands

```bash
# Development (per workspace)
npm run dev -w auth-server        # :4001 (tsx watch)
npm run dev -w crm-api            # :4002 (node --watch)
npm run dev -w apps/web           # :5173 (Vite, proxies /auth-api + /crm-api)

# Quality gates (also wired at repo root: npm run <script>)
npm run lint          # eslint in every workspace (flat config)
npm run typecheck     # tsc --noEmit (TS workspaces)
npm test              # unit tests: shared (5) + web reauth (3)
npm run build -w apps/web   # production bundle → apps/web/dist

# Integration tests — REQUIRE running MySQL + Redis (CI runs them; see below)
npm run test:integration -w auth-server   # rotation, reuse detection, lockout, invites, JWKS rotation
npm run test:integration -w crm-api       # tenant isolation, RBAC, 409 flow, bulk rollback, export, chat

# Database
npm run db:migrate   # auth migrations + crm sync
npm run db:seed      # seed both services (idempotent)
npm run keys:generate -w auth-server   # dev RS256 keypair
```

## Testing & CI

- **Unit** (run anywhere): shared utils/schemas (5 tests) + web single-flight refresh contract (H3: 5 parallel 401s → exactly 1 refresh → 5 retries).
- **Integration** (need real MySQL + Redis — **not runnable on a machine without them**): auth-server (rotation/replay → `TOKEN_REUSE`, family revocation → `SESSION_REVOKED`, login lockout 429 + `Retry-After`, invite single-use, key rotation + JWKS count, RBAC 403) and crm-api (H1 tenant 404, H2 agent scoping, H6 optimistic 409 + latest copy, H7 duplicate 201/409, bulk rollback, export magic bytes + agent 403, in-use master data 422, dashboard RBAC).
- **CI** (`.github/workflows/ci.yml`): job 1 lints, typechecks, unit-tests, builds the web bundle on Node 20; job 2 boots MySQL 8.4 + Redis 7 service containers and runs both integration suites with generated dev keys.

## Deployment

**Docker Compose (self-hosted, everything included)** — see `docker-compose.yml`. nginx terminates :80, serves the SPA, proxies `/auth-api/*`, `/crm-api/*` and WebSocket upgrades, and round-robins `crm-api` replicas (`--scale crm-api=2`). Auth keys live in the `auth-keys` volume so JWKS stays stable across restarts. For HTTPS put a TLS-terminating proxy in front and set `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, `CORS_ORIGIN=https://your-domain`.

**Firebase Hosting (SPA only)** — `apps/web/firebase.json` ships rewrites + immutable asset caching. Deploy the static frontend with `npm run build -w apps/web && cd apps/web && firebase deploy --only hosting --project <id>`, then point the `auth-api`/`crm-api` rewrites at your hosted backends (or run them on any VM/container host).

**Production hardening checklist**: set `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` PEM env vars (or mount a keys volume), strong `MYSQL_PASSWORD`, `COOKIE_SECURE=true`, real `CORS_ORIGIN`, `LOG_LEVEL=info`, and run each service with at least 2 replicas. See RUNBOOK.md for operations.

## Docs

- [DECISIONS.md](DECISIONS.md) — architecture choices, H1–H12 check status, honest limitations.
- [RUNBOOK.md](RUNBOOK.md) — day-2 operations: ports, health checks, seed reset, key rotation, troubleshooting.

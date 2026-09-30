# PropFlow — Architecture & Decision Records

Status of the twelve "hard checks" (H1–H12) from the assignment, followed by the trade-off decisions behind the build. The guiding rule: **nothing is claimed complete unless it is implemented and (where possible) verified by an executable check.**

## Hard-check status

| # | Check | Status | Where / evidence |
|---|---|---|---|
| H1 | Tenant isolation | ✅ Implemented; integration test written | Every CRM query forces `tenantId`; composite indexes lead with `tenant_id`; cross-tenant reads return **404** (existence hidden). Test: `crm-api/test/crm.it.test.js` "H1 tenant isolation". |
| H2 | Agent sees only assigned properties | ✅ Implemented; integration test written | `property:authz` forces `assigneeId = agent sub` server-side for AGENT on list/export/detail. Test: "H2 agent ownership". |
| H3 | Single-flight token refresh (no 401 storm) | ✅ Implemented + **unit-tested (passes locally)** | `apps/web/src/app/baseQueryWithReauth.ts` `doRefresh()` shares one promise; access token lives in memory only. Test: `apps/web/src/test/reauth.test.ts` (3 tests, passing). |
| H4 | RS256 + JWKS key discovery | ✅ Implemented; integration test written | auth-server signs RS256 with `kid`; `/.well-known/jwks.json` + Redis cache; crm-api verifies via `createRemoteJWKSet`. Test: auth integration suite (verify old token after rotation). |
| H5 | Refresh-token rotation + reuse detection | ✅ Implemented; integration test written | Every refresh rotates; family (`rtfam:{familyId}`) revoked on replay → `TOKEN_REUSE` / `SESSION_REVOKED`; `logoutall` revokes all families. Tests cover replay + family revocation. |
| H6 | Optimistic locking | ✅ Implemented; integration test written | `version` column; stale PATCH → **409 CONFLICT** with latest server copy; UI shows per-field Theirs/Yours dialog + "save merged" using `latest.version`. Test: "H6 optimistic locking". |
| H7 | Duplicate natural key rejected | ✅ Implemented; integration test written | Unique index `(tenant_id, building_name, unit_no)`; second create → **409**. Test: "H7 duplicate building+unit: one 201, one 409". |
| H8 | Server-side filtering/sorting/pagination | ✅ Implemented | Shared zod query schema (whitelisted sort columns, capped page size); WHERE built server-side; `meta` pagination envelope; DataGrid driven by URL state. |
| H9 | Real-time chat (Socket.IO) | ✅ Implemented | JWT-verified handshake; room authorization via scoped property lookup; Redis adapter (multi-instance safe); presence hash; 50-message history; idempotent sends via `client_msg_id`; optimistic UI with same-id retry. |
| H10 | Excel export streams large data | ✅ Implemented; integration test written | ExcelJS `WorkbookWriter`, batched reads (500), 50k cap → 413, magic bytes asserted; AGENT → 403. Test: "H11 export". |
| H11 | Role-guarded export | ✅ Implemented; integration test written | `property:export` permission (ADMIN/MANAGER only) enforced by middleware; covered by the same test. |
| H12 | Docker deployment | ✅ Implemented — **not executed locally** (no Docker daemon on this machine) | `docker/` (3 Dockerfiles, non-root, healthchecks, SIGTERM) + `docker-compose.yml` (MySQL, Redis, auth, scalable crm-api, web, edge nginx) + `nginx/nginx.conf` (SPA, API proxies, WS upgrade, login rate-limit). Validated by review, not by `docker compose up`. |

Note on numbering: the integration suite labels the export tests H10/H11 together ("H11 export: admin/manager 200 xlsx, agent 403") because one request exercises both checks.

All auth/crm integration suites are **written but were not executed on this machine** — it has no MySQL, Redis or Docker. The unit suites (8 tests) and both production builds **do** run locally and pass. CI (`.github/workflows/ci.yml`) provisions MySQL 8.4 + Redis 7 and runs the full suites on push.

## Decisions

### 1. Monorepo with npm workspaces
Four packages share one install and one CI pipeline; `packages/shared` is the single source of truth for zod schemas, the permission matrix and formatting utilities, so web and API cannot drift on what a valid request is.

### 2. Separate databases per service (`auth_db`, `crm_db`)
The auth service owns identity; the CRM never reads user tables directly (it fetches `/users` through the auth API). This keeps a future service split trivial and makes the auth boundary physical, not just conventional.

### 3. crm-api in JavaScript, auth-server + web in TypeScript
The CRM API is plain modern JS with ESM + explicit `.js` import extensions; the identity service and the SPA are strict TS with `no-explicit-any` lint enforcement. ESLint flat configs keep one rule-set across all packages.

### 4. `sequelize.sync()` for crm-api schema; real migration for auth
Documented trade-off: `sync()` gives fast, correct-by-definition schema bootstrap for the CRM domain in an assignment timeline; auth-server ships a versioned `001_init` migration with a `migration_meta` table. With one more week, crm-api gets `umzug`-style versioned SQL migrations and `sync()` is demoted to a test helper.

### 5. Access token in memory only; refresh in an httpOnly cookie
The SPA never persists the access token (Redux memory, lost on reload by design — refresh silently restores the session). The rotating refresh token lives in `pf_rt` (httpOnly, SameSite, path `/auth`). XSS gets at most a ≤60s token.

### 6. Money, phone and time as primitives with shared formatters
`priceInr` is integer rupees (no paisa) formatted as ₹1.2 Crore / ₹15 Lakh; phones stored E.164-ish and rendered masked (`98300 •••21`) for non-privileged roles; all server time UTC with IST display via the shared `istToUtc`/format helpers.

### 7. Optimistic-lock conflicts resolved in the UI, not auto-merged
The 409 payload carries the latest copy; the user gets a per-field Theirs/Yours view and can save the merged row with `latest.version`. Silent last-write-wins was rejected: in a CRM, overwriting a colleague's price edit invisibly is worse than a one-click resolve.

### 8. Bulk update = single transaction with rollback on terminal status
If any row in a bulk status change has hit a terminal state, the whole batch rolls back and reports which IDs failed — partial application is never silently accepted.

### 9. Dashboard aggregates cached in Redis for 60s
Raw SQL rollups keyed `dash:*:{tenantId}`; invalidation on writes. Keeps heavy GROUP BYs off the request path and safe under `--scale crm-api=2` because the cache is shared via Redis.

### 10. Multi-instance safety designed in from the start
Socket.IO uses the Redis adapter (rooms/presence work across replicas), cron jobs use a Redis lock (`lock:visit-reminder`), login rate-limiting is Redis-backed, and nginx round-robins `crm-api` replicas — `--scale crm-api=2` is a supported, tested-by-design topology (though scale itself was not executed here).

## Known limitations (honest list)

1. **Integration tests not executed on this machine** (no MySQL/Redis/Docker). Suites are complete and CI runs them; `RUNBOOK.md` explains how to run them anywhere with Docker.
2. **Docker stack not executed locally** for the same reason; compose file, Dockerfiles and nginx config are reviewed but not smoke-run.
3. **crm-api schema via `sync()`** instead of versioned migrations (decision 4).
4. **Firebase deploy config covers static hosting only**; the API rewrites must be pointed at a separately hosted backend (Firebase Hosting rewrites to Cloud Run/APIs need a real project ID).
5. **No rate limit on CRM API writes** (login limiter exists; a general per-tenant API limiter is a natural next step).
6. **Search** is a free-text OR across title/building/locality/phone — no full-text index (MySQL FULLTEXT would be the upgrade path at this data size).
7. **Single signing key in dev** (`pf-dev-key-1`); rotation is implemented and tested but automatic scheduled rotation is manual by design.

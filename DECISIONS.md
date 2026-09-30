# DECISIONS.md — how I built it and why

This is the "why" document. The assignment listed twelve hard checks (H1–H12) plus a pile of architectural choices; what follows is an honest account of what I did, what I'd defend in a design review, and what I know is a compromise. The rule I held myself to while building: **don't claim anything works unless I can point at the code that does it — and ideally a test that proves it.**

## The hard checks, honestly

| # | Check | Status | Where it lives |

| H1 | Tenant isolation | ✅ built, integration test written | Every CRM query forces `tenantId` from the JWT (never from the client), every composite index leads with `tenant_id`, and cross-tenant reads return **404** — existence hidden, not just denied. Test: `crm-api/test/crm.it.test.js`. |
| H2 | Agent sees only assigned properties | ✅ built, integration test written | Enforced **server-side** (`assigneeId = agent sub` forced into list/detail/export queries), so curl-ing the API as an agent gets the same restriction as the UI. |
| H3 | Single-flight token refresh | ✅ built, **unit-tested — passing** | 5 parallel requests hitting 401 trigger exactly **one** `/auth/refresh`, then all 5 retry with the new token. `apps/web/src/app/baseQueryWithReauth.ts`, test in `apps/web/src/test/reauth.test.ts`. |
| H4 | RS256 + JWKS key discovery | ✅ built, integration test written | auth-server signs with `kid`, publishes `/.well-known/jwks.json` (Redis-cached); crm-api verifies via `createRemoteJWKSet` and never touches a private key. Test proves tokens signed by the previous key still verify after rotation (grace window). |
| H5 | Refresh rotation + reuse detection | ✅ built, integration tests written | Every refresh rotates; replaying an old token revokes the whole family → `TOKEN_REUSE`, subsequent use → `SESSION_REVOKED`; `logoutall` kills every family for a user. |
| H6 | Optimistic locking | ✅ built, integration test written | `version` column; stale PATCH → **409 with the latest copy**; UI shows a per-field Theirs/Yours dialog and can save the merge using `latest.version`. |
| H7 | Duplicate natural key rejected | ✅ built, integration test written | Unique index on `(tenant_id, building_name, unit_no)`; two concurrent creates → one 201, one 409. |
| H8 | Server-side filter/sort/pagination | ✅ built | One shared zod query schema; sort columns whitelisted; page size capped; the DataGrid is URL-driven so any filtered view is shareable/bookmarkable. |
| H9 | Real-time chat | ✅ built | JWT-verified handshake, per-property room authorization, Redis adapter (rooms/presence work across replicas), 50-message history, **idempotent sends via `client_msg_id`** — the UI retries with the same id, so a timeout never duplicates a message. |
| H10 | Streaming Excel export | ✅ built, integration test written | ExcelJS `WorkbookWriter` streams, reads are batched (500/round trip), 50k-row cap → 413, magic bytes asserted in the test. |
| H11 | Role-guarded export | ✅ built, integration test written | `property:export` is ADMIN/MANAGER-only; agents get 403 (same test as H10). |
| H12 | Docker deployment | ✅ written, **not executed on my machine** | Full compose stack + 3 app Dockerfiles + edge nginx; since then also a Render blueprint. No Docker daemon on the machine I built this on — details below. |

One honest note on the whole table: the **integration** suites (auth + crm) are written and wired into CI, but I could not execute them locally — my machine has no MySQL, Redis or Docker. The **unit** suites (shared utils, the H3 refresh contract) and both production builds run and pass everywhere. CI (`.github/workflows/ci.yml`) boots MySQL 8.4 + Redis 7 and runs the full suites on every push; that's the intended verification path and I'd point any reviewer there first.

## Decisions I'd defend

**1. One monorepo, one source of truth for contracts.** `packages/shared` owns the zod schemas, the role/permission matrix and the formatting rules (₹ lakh/crore, masked phones, IST). The web app and both servers literally cannot disagree about what a valid request looks like. When the spec changed mid-build, one file changed.

**2. Two databases, and the CRM never reads auth tables.** `auth_db` belongs to auth-server; when crm-api needs the user list it calls the auth API, not the user table. That makes the service boundary physical instead of aspirational, and a future split into two deployables is a config change, not a refactor.

**3. TypeScript where correctness compounds, JS where it doesn't.** Auth-server and the SPA are strict TS (`no-explicit-any` enforced by ESLint — it caught 16 `any`s during hardening, all now typed). crm-api is plain modern ESM JS. Every package passes the same flat ESLint config rules. Pragmatic, not purist.

**4. `sequelize.sync()` for crm-api, a real versioned migration for auth.** I know exactly how this looks in a design review, so here's the honest trade-off: auth's schema is security-critical and stable, so it ships as a proper `001_init` migration with a `migration_meta` table. crm-api's schema is derived from its Sequelize models and `sync()` bootstraps it correctly for a from-scratch deployment — which is what this assignment is. With one more week, crm-api gets umzug migrations and `sync()` is demoted to a test helper. I chose to spend that week on the hard checks instead.

**5. Access token in memory only; refresh token in an httpOnly cookie scoped to `/auth-api/auth`.** XSS can steal at most a 60-second access token; the refresh token is unreadable from JS. The cookie path matters: `/auth-api/auth` survives both the Vite dev proxy and the production edge because both strip the `/auth-api` prefix, and the path uniquely scopes which requests carry the cookie (only the refresh/logout endpoints need it — nothing else should ever send it). Production sets `Secure` + `SameSite=None` behind TLS.

**6. Money, phones and time as integers + shared formatters.** `priceInr` is integer rupees (no floats touching money), phones are stored normalized and rendered masked (`98300 •••21`) for agents, everything server-side is UTC with IST rendering at the edges. Boring on purpose.

**7. Conflicts are resolved by a human, not merged by the server.** When optimistic locking fires, the user sees a per-field Theirs/Yours dialog and saves the merged row with the latest version. Silent last-write-wins was rejected deliberately — invisibly overwriting a colleague's price edit is worse than a one-click resolve.

**8. Bulk updates are all-or-nothing.** One transaction; if any row has reached a terminal status the whole batch rolls back and reports the offending IDs. Partial application is never silently accepted.

**9. Dashboard aggregates live in Redis for 60 seconds.** Raw SQL rollups keyed per tenant, invalidated on writes. Keeps heavy GROUP BYs off the request path and stays correct when crm-api is replicated because the cache is shared, not per-process.

**10. Multi-instance safety was designed in, not bolted on.** Socket.IO uses the Redis adapter, cron jobs take Redis locks (`lock:visit-reminder`), rate limiting is Redis-backed, and both the compose stack and the Render blueprint put replicas behind one edge. `--scale crm-api=2` is a supported topology by construction.

**11. Secrets never live in the repo.** Dev keys are gitignored and generated locally; production takes PEMs as env vars (with `\n` escapes) and **refuses to boot** without them. The Render blueprint marks every secret `sync: false` so they're dashboard prompts, never YAML literals.

**12. Render for hosting.** Render has no managed MySQL, so the blueprint runs MySQL as a private service with a disk (Render's own documented pattern) with the two-database provisioning baked into the image; Redis uses managed Key Value; the SPA and both APIs stay private behind one public nginx edge. Same-origin design survives the move to the cloud untouched — that was the deciding factor versus splitting the SPA onto Vercel and fighting cross-domain cookies.

## What I know is still weak

1. Integration suites + Docker stack unexecuted on my machine (no infra) — CI or any Docker host runs them in minutes.
2. `sync()` instead of versioned migrations on crm-api (decision 4).
3. Search is a free-text OR across four columns — fine at ~10k rows, needs a FULLTEXT index at 1M+.
4. No rate limiting on CRM write endpoints (login has one at two layers; the general API doesn't yet).
5. The MUI chunk is ~700KB minified — route-level code splitting is the obvious next win.
6. Demo seed properties are procedurally generated; realistic text/geo data would make demos nicer.

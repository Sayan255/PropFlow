# Deploying PropFlow to Render

This guide takes the repo from push to a working app on Render. The blueprint in [render.yaml](../render.yaml) creates everything: MySQL, Redis (Key Value), the three app services, and one public nginx edge.

## How it's laid out on Render

```
                     Render private network
 ┌─────────────────────────────────────────────────────────────────┐
 │  propflow-mysql (pserv + disk)     propflow-redis (keyvalue)    │
 │         ▲      ▲                            ▲      ▲            │
 │  propflow-auth (pserv :4001)     propflow-crm (pserv :4002)     │
 │         ▲                               ▲            ▲           │
 │         └──────────── /auth-api ─────────┘     /crm-api ─┐       │
 │                                                          │       │
 │  propflow-web (pserv, static SPA)  ◄──────────────────┐  │       │
 └─────────────────────────────────────────────────────┼──┼───────┘
                                                       ▼  ▼
                            propflow-edge (web, public)  ← the only URL
```

Render has **no managed MySQL**, so MySQL runs as a **private service** (Render's official pattern: Docker image + persistent disk). Redis uses Render's managed **Key Value**. All app services are private; the **edge** is the single public service, serving the SPA and proxying `/auth-api/*` and `/crm-api/*` (including WebSocket upgrades for chat) — the same topology as the repo's `docker-compose.yml`, so no application changes are needed for cloud.

## Prerequisites

1. The repo pushed to GitHub/GitLab with `render.yaml` at the root.
2. A Render account (Blueprints work on free workspaces; the services themselves need paid plans — see costs below).
3. An RSA keypair for JWT signing (generate once, keep the private key safe):

   ```bash
   openssl genrsa -out jwt-private.pem 2048
   openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
   ```

   The app accepts PEM contents as env vars with `\n` escapes. To produce them:

   ```bash
   awk 'NR==1{printf "\""}{printf "%s\\n", $0}END{print "\""}' jwt-private.pem
   ```

   Paste the resulting single-line string (quotes included) into the dashboard prompt.

## Step-by-step

### 1. Create the Blueprint

Render Dashboard → **New +** → **Blueprint** → pick this repo. Render parses `render.yaml` and shows all six services it will create. You will be prompted once for each `sync: false` variable — have these ready:

| Prompt | Value |
|---|---|
| `MYSQL_PASSWORD` | a strong password (save it — auth/crm use the same value) |
| `MYSQL_ROOT_PASSWORD` | a different strong password |
| `CORS_ORIGIN` (auth + crm) | `https://propflow-edge.onrender.com` (or your custom domain) |
| `FRONTEND_URL` (auth) | same URL as above |
| `SEED_PASSWORD` | the password for all 9 demo accounts (e.g. keep `Password123!` for a demo) |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | the `\n`-escaped PEM strings from above |

### 2. Wait for the first deploy (10–20 min)

Order matters and the blueprint handles it: MySQL provisions its disk and runs the init script (creates `auth_db` + `crm_db`, grants the `propflow` user) → auth and crm sync their schemas → auth seeds 9 accounts → crm seeds 500 properties + visits/notes/chats. Watch progress in each service's **Logs** tab. The edge turns green once its three upstreams answer.

### 3. Verify

```bash
EDGE=https://propflow-edge.onrender.com     # your actual URL
curl -s $EDGE/healthz                       # → "edge ok"
curl -s $EDGE/auth-api/health | head -c 200 # → {"status":"ok",...}
curl -s $EDGE/crm-api/health | head -c 200  # → {"status":"ok",...}
```

Then open the edge URL in a browser and log in as `admin@tenant-a.local` with your `SEED_PASSWORD`.

### 4. Custom domain (optional but recommended)

Edge service → **Settings → Custom Domains** → add your domain. Render provisions TLS automatically. Then update `CORS_ORIGIN` and `FRONTEND_URL` on auth + crm to the new URL and **Manual Deploy** both so cookies/CORS match the browser origin.

## Costs (honest)

Rough monthly figures at current Render pricing: five app services on `0.5c-512mb` (~$7 each = ~$35) + MySQL on `1c-2g` with a 10 GB disk (~$20–25) + the smallest Key Value (~$10) → **~$65–70/month for the full six-service topology**. Ways to trim it:

- **Merge auth + crm into one service** — they're separate processes by design, but a small proxy or mounting both apps in one Node process would halve the bill. Trade-off: loses the two-database, two-service architecture the assignment asked for.
- **Skip the SPA pserv** — build the SPA into the edge image itself (single-stage nginx serving `dist/` + proxying). Saves ~$7 but couples frontend releases to edge deploys.
- **Downsize MySQL** to the smallest disk-backed plan if this is a demo.
- MySQL is the priciest line item (disk + snapshots). At true production scale you'd move it to a managed MySQL (PlanetScale, Aiven, RDS via peering) and point `MYSQL_HOST` at it.

**Do not use `free` plans for this app**: they sleep, which breaks Socket.IO chat, the reminder cron, and the first-login-after-idle experience.

## Operational notes

- **Migrations/seed on every deploy**: both app entrypoints run schema sync + idempotent seed before listening, so a fresh deploy always converges. `SEED_PROPERTIES_PER_TENANT=500` keeps Render's first boot fast; set it back to `10482` if you want the full assignment-scale dataset (adds several minutes to first boot only).
- **Cron**: `ENABLE_CRON=true` on crm — reminders and stale flagging run inside the single crm replica. If you scale crm beyond one instance, keep cron on exactly one (set `ENABLE_CRON=false` on the others).
- **Key rotation**: Platform console → Security → Rotate keys rotates in-app and re-publishes JWKS; tokens from the previous key keep verifying during the grace window. The `JWT_*` env PEMs are only the bootstrap key.
- **Backups**: rely on MySQL dumps, not disk snapshots (`mysqldump` from the service shell, per Render's guidance). Redis persistence is journal+snapshot for sessions/caches — acceptable to lose.
- **Logs/monitoring**: every service ships structured JSON logs to Render's log stream; `/health` endpoints return per-dependency status (mysql/redis/jwks) and 503 when degraded.

## Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| crm health shows `jwks:false` | auth wasn't reachable when crm started → restart crm after auth is live |
| Login 401 for every seeded account | seed didn't run → check auth logs for `[entrypoint] seeding`; re-run `Manual Deploy` on auth |
| Cookie missing after login (refresh loop) | `CORS_ORIGIN`/`FRONTEND_URL` don't match the browser URL exactly (scheme included) |
| 502 on `/auth-api/*` only | auth pserv crashed → check its logs; usually a bad `JWT_PRIVATE_KEY` escape |
| MySQL "access denied" in app logs | `MYSQL_PASSWORD` prompted at blueprint ≠ value the apps got → re-set on auth + crm and redeploy |
| Chat disconnects through the edge | Websocket upgrade missing → `docker/edge.conf.template` includes it; don't remove the `Upgrade`/`Connection` headers |

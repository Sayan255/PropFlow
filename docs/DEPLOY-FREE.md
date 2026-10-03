# PropFlow on Render — always-on application services with TiDB

Same single-origin architecture as the paid blueprint (`render.yaml`): one public
**edge** service serves the React app **and** proxies `/auth-api` + `/crm-api`,
so the browser talks to exactly one URL — **no `VITE_API_ORIGIN` needed**. This
variant keeps MySQL on TiDB and uses paid, always-on Render plans for the
application services. It retains the service names from the existing Free
Blueprint so Render can update those resources in place.

| Piece | Service | Cost |
|---|---|---|
| MySQL | [TiDB Cloud Serverless](https://tidbcloud.com) (MySQL wire-compatible) | free, no card |
| Redis | Render Key Value 256MB with persistence | Render plan charges apply |
| auth / crm / edge / SPA | Render Starter web services | Render plan charges apply |

Free Render services sleep after about 15 minutes idle, so they cannot provide
reliable always-on login. Syncing the plan changes in this Blueprint incurs
Render charges; review the current amounts in Render before applying. TiDB
Serverless may also throttle heavy bursts.

## Step 0 — Deploy the code

The blueprint is `render-free.yaml` at the repo root. Render's Blueprint dialog
has a **Blueprint Path** field — enter `render-free.yaml` there. It upgrades
the existing app services and Redis to always-on paid plans and keeps TiDB.
Review the plan and price changes before applying them.

## Step 1 — Create the free TiDB database

1. Sign up at [tidbcloud.com](https://tidbcloud.com) (GitHub login, **no card**).
2. Create a **Serverless / Starter** cluster (any region; pick one near you).
3. Open the cluster's **SQL console** (or connect with any MySQL client) and run:
   ```sql
   CREATE DATABASE IF NOT EXISTS auth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE IF NOT EXISTS crm_db  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   (TiDB needs databases created up front — the container entrypoints here do
   run `CREATE DATABASE IF NOT EXISTS` too, but doing it once in the console
   avoids first-boot races.)
4. Note the **Connection** values shown in the cluster page:
   - `MYSQL_HOST` — like `abc123def.cluster-abcxyz.ap-southeast-1.tidbcloud.com`
   - `MYSQL_PORT` — `4000` (already baked into the blueprint)
   - `MYSQL_USER` — like `4AbCdEfGh.root`
   - `MYSQL_PASSWORD` — the app password you set in TiDB (reset it there if unknown)

## Step 2 — Generate the JWT keys (same as always)

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
awk 'NR==1{printf "\""}{printf "%s\\n", $0}END{print "\""}' jwt-private.pem
awk 'NR==1{printf "\""}{printf "%s\\n", $0}END{print "\""}' jwt-public.pem
```

Paste the two quoted one-liners (without the surrounding quotes) into the
`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` prompts.

## Step 3 — Deploy the blueprint

Render Dashboard → **New + → Blueprint** → pick the repo → Blueprint Path
`render-free.yaml` → **Apply**. You'll be prompted for:

| Prompt | Enter |
|---|---|
| `MYSQL_HOST` | TiDB host from step 1 |
| `MYSQL_USER` | TiDB username from step 1 |
| `MYSQL_PASSWORD` | TiDB app password |
| `SEED_PASSWORD` | demo login password (accounts are seeded with it on boot) |
| `CORS_ORIGIN` / `FRONTEND_URL` | fill after first deploy (next section) — `https://<edge-url>` |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | from step 2 |

Wait for all four services to show **Live** (first deploy ≈ 10–15 min: three
Docker builds + migrations + seeding).

## Step 4 — Close the CORS loop

1. Open the **propflow-free-edge** service page → copy its URL
   (e.g. `https://propflow-free-edge-a1b2.onrender.com`).
2. Edit **propflow-free-auth** and **propflow-free-crm** → Environment:
   - `CORS_ORIGIN=https://propflow-free-edge-a1b2.onrender.com`
   - `FRONTEND_URL=https://propflow-free-edge-a1b2.onrender.com`
3. Save — both services redeploy themselves. Done: the site now serves the app
   AND the APIs from one origin; login, dashboards, chat, exports all work.

## Demo accounts (seeded on boot)

`superadmin@propflow.local`, `admin@tenant-a.local`, `agent@tenant-a.local`,
`viewer@tenant-a.local`, `admin@tenant-b.local`, … — all with `SEED_PASSWORD`.
Full role matrix in [README.md](README.md).

## Troubleshooting

- **auth crash-loops with `ER_...` / `ETIMEDOUT`** → TiDB host/user/password
  wrong, or the region's network is slow to accept the first connections.
  Check the service **Logs** tab; fix the env var; the service redeploys.
- **`Access denied for user`** → TiDB usernames include the `.root` suffix —
  copy it exactly.
- **crm health shows `jwks: false`** → auth isn't reachable yet; it self-heals
  once auth is Live (services may start in parallel).
- **Unknown kid / 401 after login** → the JWT keys were changed after tokens
  were issued; log out/in again.
- **`Too many connections`** → TiDB Serverless limits concurrent connections;
  restart the auth/crm services to drain stale pools after heavy use.

# Deploying the PropFlow frontend to Firebase Hosting

Firebase Hosting serves the built React app (SPA) on a global CDN with a free HTTPS
domain (`https://propflow-38327.web.app`). This is the fastest way to get a shareable
link for the submission — it costs nothing.

**Important:** Firebase only hosts the *frontend*. The auth server, CRM API, MySQL and
Redis still need a host (Render, per [DEPLOY-RENDER.md](DEPLOY-RENDER.md), a VM, or
any Node host). The deployed site points at them via `VITE_API_ORIGIN`.

## One-time setup

1. Create the project at [console.firebase.google.com](https://console.firebase.google.com)
   (this repo is already linked to `propflow-38327` via `.firebaserc` — reuse it or
   run `firebase use --add` to point at a different project).

2. Log the CLI in and verify the project:

   ```bash
   firebase login
   firebase use propflow-38327
   ```

## Deploy

From the repo root:

```bash
npm run deploy:web
```

That builds `apps/web` (typecheck + vite build) and uploads `apps/web/dist` to
Firebase Hosting. First deploy asks which region / whether to create the site —
the defaults are fine. When it finishes it prints the live URL:

```
https://propflow-38327.web.app
```

Repeat `npm run deploy:web` any time you change the frontend.

## Point the frontend at your backends

The app calls APIs at the same origin (`/auth-api/...`, `/crm-api/...`) unless
`VITE_API_ORIGIN` is set. With Firebase serving the SPA and APIs on a different
domain, the browser is now making **cross-site** requests with cookies. That works
(the auth cookies are `SameSite=None; Secure` in production, and `credentials:
'include'` is already set), but it needs HTTPS on both sides, CORS allowing the
Firebase origin, and browsers that accept third-party cookies — Safari blocks
them by default, which breaks the refresh flow there. Same-origin avoids the
entire class of problems.

Two supported layouts:

### Layout A — single site (recommended for the demo)

Skip `VITE_API_ORIGIN`. Deploy the *whole* stack behind one public hostname
(the Render blueprint's `propflow-edge` service does exactly this), and make that
hostname serve the same SPA. Firebase then isn't needed at all.

Use this layout if you want zero cookie/CORS friction.

### Layout B — split (Firebase SPA + separate API host)

1. Deploy the backends (Render blueprint, VM, etc.) and note the public API base,
   e.g. `https://propflow-api.onrender.com`.

2. Build with the API origin baked in and deploy:

   ```bash
   VITE_API_ORIGIN=https://propflow-api.onrender.com npm run deploy:web
   ```

3. On the backend(s) allow the Firebase origin:

   - `CORS_ORIGIN=https://propflow-38327.web.app,https://propflow-38327.firebaseapp.com`
   - `FRONTEND_URL=https://propflow-38327.web.app` (used in invitation links)
   - auth server cookies are already `SameSite=None; Secure` in production
     (`COOKIE_SAME_SITE` overrides if needed).

4. Realtime (Socket.IO) and the refresh-cookie flow work because the API host is
   reached directly from the browser with `credentials: 'include'`.

## What this repo configures

- `firebase.json` (root) — hosting target `apps/web/dist`, SPA rewrites to
  `index.html`, long-cache headers for `/assets/**` (hashed filenames) and
  `no-cache` for `index.html`, so new deploys are picked up instantly.
- `npm run deploy:web` (root `package.json`) — build + `firebase deploy --only hosting`.
- `.firebaserc` — project alias `default` → `propflow-38327`.

## Troubleshooting

- **`Not logged in` / permission errors** → `firebase login`, then
  `firebase use --add` to re-link the project (you need Editor on it).
- **Deploy succeeds but the page is blank** → check the browser console; a blank
  white page after a fresh deploy is almost always stale `index.html` cache —
  hard refresh. If it persists, confirm `apps/web/dist/index.html` exists locally.
- **API calls fail from the live site** → the API origin wasn't baked in
  (rebuild with `VITE_API_ORIGIN`) or the backend's `CORS_ORIGIN` doesn't list
  the Firebase domain.
- **Login works but refresh loops back to login** → cookies: the backend and the
  frontend must both be HTTPS (they are, on Firebase/Render) and `SameSite=None`
  must be in effect (default when `NODE_ENV=production`).

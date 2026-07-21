# Railway production deployment — NET360 API

## Health-check root cause (fixed)

Railway health checks were failing because:

1. `healthcheckPath` was `/api/health/ready`, which returned **503** while MongoDB was still connecting after `connectMongo()` set `lastUri`.
2. `/api/health` awaited Redis `getRedisMain()`, which could stall health probes on a bad Redis host.
3. Default `npm start` previously launched the SPA helper (`server/web.js`), not the API.

### Fixes

- Railway healthcheck → `/api/health` (always 200 when the HTTP server is listening).
- `/api/health` no longer connects to Redis; reports `isRedisReady()` only.
- `/api/health/ready` treats Mongo `connecting` / reconnect as OK during startup.
- `package.json` `"start": "node server/index.js"`.
- `Procfile` + `nixpacks.toml` skip Vite build on Railway.

## Service settings

| Setting | Value |
|---------|--------|
| Start command | `node server/index.js` |
| Build command | **Skip Vite** (`railway.toml` `buildCommand`) — frontend is on Vercel |
| Health check | `GET /api/health` |
| Custom domain | `api.net360preparation.com` |
| Node | 20 (`.nvmrc`, `engines`) |

If build fails with `vite: not found`, see [RAILWAY-BUILD-VITE-FIX.md](./RAILWAY-BUILD-VITE-FIX.md).

**Main vs Admin:** See [RAILWAY-SERVICES.md](./RAILWAY-SERVICES.md). Production API is **Main only**. Keep `net360-admin` idle.

After adding Variables in Railway, **Redeploy** so the running container picks them up. Confirm `/api/health` shows `env=production`, `mongo.configured=true`, `firebaseAdminConfigured=true`.

## DNS cutover

1. Deploy Railway; confirm `https://<railway>/api/health` → 200.
2. Attach custom domain `api.net360preparation.com`.
3. Lower DNS TTL; switch CNAME/ALIAS to Railway.
4. Keep previous host warm until smoke tests pass.
5. Decommission previous host after soak.

## Firebase Admin

Set `FIREBASE_SERVICE_ACCOUNT_JSON` (or BASE64 / split fields). See `RAILWAY-ENV.md`.

## Rollback

Repoint DNS for `api.net360preparation.com` to the previous origin. Pause Railway.

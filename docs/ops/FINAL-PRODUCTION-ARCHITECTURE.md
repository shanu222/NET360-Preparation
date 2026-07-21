# NET360 Final Production Architecture (web-production)

Date: 2026-07-22

## Target topology

```text
Vercel (React/Vite SPA + Admin UI at /admin)
        │  VITE_API_URL
        ▼
https://api.net360preparation.com  →  Railway service: net360-preparation
        │
        ├── MongoDB Atlas
        └── Firebase Admin (same project as client Auth)
```

| Layer | Single instance |
|-------|-----------------|
| Frontend | Vercel only |
| Backend | Railway **`net360-preparation` only** |
| Database | MongoDB Atlas |
| Auth | Firebase project `resilience360-27f15` (+ JWT on API) |

## Railway Admin service

`net360-admin` is a **duplicate Express API**, not required. Keep idle / paused. Admin UI uses Vercel `/admin` → Main API. See `RAILWAY-SERVICES.md`.

## AWS

Runtime AWS/S3 SDK removed. Static media + guide video bundled under `public/` (served by Vercel). Upload route returns `410 UPLOAD_RETIRED`.

## Build

| Host | Build |
|------|--------|
| Vercel | `npm run build` → Vite (via `build-for-host.mjs` when vite installed) |
| Railway | `buildCommand` / `build-for-host.mjs` **skips Vite**; start `node server/index.js` |

## Environment (final)

### Railway Main (backend only)

Required: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON` or split), `ADMIN_LOGIN_*`, `CORS_ALLOWED_ORIGINS`, `ISSUE_AUTH_BODY_TOKENS=true`.

Remove from Railway: all `VITE_*`.

### Vercel (frontend only)

`VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`.

No Mongo/JWT/Firebase Admin secrets.

## Live verification snapshot (2026-07-22)

| Check | Result |
|-------|--------|
| Guide video on Vercel | PASS (`video/mp4`) |
| Railway `/api/health` | HTTP PASS but **`env=development`, mongo/firebase not configured** |
| DNS `api.net360preparation.com` | Not ready until Railway secrets + redeploy |

## Final GO / NO-GO

**NO-GO for declaring “only two branches” and DNS cutover.**

- Branch purge blocked by unique commits on Android / paid-services lines.
- Railway Main still not loading production secrets in the running container.

**GO for architecture direction on `web-production`:** single Vercel frontend + single Railway API + Atlas + Firebase; AWS runtime gone; Vite skipped on Railway.

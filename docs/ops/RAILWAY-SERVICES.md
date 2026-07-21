# Railway services — Main vs Admin

## Production backend (required)

| Service | Role |
|---------|------|
| **`net360-preparation`** (Main) | Sole production Express API (`node server/index.js`). Custom domain: `api.net360preparation.com`. |

Set **only backend** secrets on Main (`MONGODB_URI`, `JWT_*`, Firebase Admin, `ADMIN_LOGIN_*`, `CORS_*`, `ISSUE_AUTH_BODY_TOKENS`, `NODE_ENV=production`, etc.).  
**Do not** rely on `VITE_*` on this service (Vite vars are build-time for the SPA).

## `net360-admin` (idle / not required)

| Finding | Evidence |
|---------|----------|
| Same Express API as Main | Root returns `API is running`; `/api/health` reports `service: net360-api` |
| Admin UI is in the Vite app | `src/main.tsx` — `/admin` path or host `admin.*` / `net360-admin` + optional `VITE_ADMIN_ONLY` |
| Student + admin share one frontend | Deployed on **Vercel**; admin calls Main via `VITE_API_URL` |

**Conclusion:** A second Railway service is **not required** for production.  
**Do not delete** the Railway `net360-admin` service (ops preference). Keep it **idle** (paused or unused). Do not point production DNS at it. Do not duplicate Mongo/JWT secrets there unless you intentionally run a standby API.

If you later want a dedicated admin SPA host, that would be a **frontend** deploy (`VITE_ADMIN_ONLY=true` + `npm run build` + `node server/web.js` or Vercel), not a second Express API.

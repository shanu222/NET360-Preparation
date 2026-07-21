# Railway services — single-backend architecture

## Production backend (required)

| Service | Role |
|---------|------|
| **`net360-preparation`** (Main) | Sole production Express API (`node server/index.js`). Intended custom domain: `api.net360preparation.com`. |

Set **only backend** secrets on Main. See `RAILWAY-ENV.md` / `docs/ops/SINGLE-BACKEND-CONSOLIDATION.md`.  
**Do not** put `VITE_*` on this service.

Student + Admin APIs both live in this one Express process (`/api/auth/*`, `/api/admin/*`, MCQs, payments, community, support).

## `net360-admin` — verified duplicate (safely removable)

| Finding | Evidence |
|---------|----------|
| Same Express API as Main | Historical live probe: root `API is running`; `/api/health` → `service: net360-api` (same as Main) |
| Same codebase start command | `node server/index.js` / same repo |
| Admin UI is not this service | Vite SPA on **Vercel** — `/admin` or host heuristics in `src/main.tsx`; calls Main via `VITE_API_URL` / `api.net360preparation.com` |
| Not on production DNS | Production custom API domain targets Main only |
| Current reachability (2026-07-22) | Prior host `net360-admin-production-7ac3.up.railway.app` **does not resolve** — unused for traffic |

**Conclusion:** `net360-admin` is **not required**. It is a second deployment of the same Express server.

### Operator action (dashboard — this agent has no Railway delete token)

1. Confirm no custom domain points at `net360-admin`.
2. Pause the service (optional interim).
3. **Delete** `net360-admin` from the Railway project when ready.
4. Keep secrets **only** on `net360-preparation`.

Do **not** recreate a second Express API for “admin”.

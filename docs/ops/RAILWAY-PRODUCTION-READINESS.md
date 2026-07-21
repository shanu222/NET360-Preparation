# NET360 Railway production readiness

Date: 2026-07-21  
Branch: `fix/railway-health-production`

## Architecture (target)

```
Vercel (React/Vite) → Railway (Express) → MongoDB Atlas
Firebase Auth + JWT
```

AWS/EC2/S3/CloudFront: **removed from runtime**.

---

## 1. Repository audit (summary)

| Area | Finding |
|------|---------|
| Backend | `server/index.js` Express API; Mongo models; Firebase Admin; JWT |
| Frontend | Vite SPA on Vercel; `VITE_API_URL` → `api.net360preparation.com` |
| Admin | Same API surface under `/api/admin/*` |
| Auth | Firebase ID tokens + JWT access/refresh; `ISSUE_AUTH_BODY_TOKENS` for Android |
| Database | MongoDB Atlas only for MCQs/tests/users/etc. |
| Media | Bundled under `public/`; `getMediaUrl()` same-origin |
| Uploads | `POST /api/upload` → **410 UPLOAD_RETIRED** |
| Build | Vite on Vercel; Railway skips Vite (`nixpacks.toml`) |
| Deploy | `railway.toml` + `Procfile` → `node server/index.js` |
| Health | `GET /api/health` (liveness), `GET /api/health/ready` (Mongo) |
| AWS runtime | No `@aws-sdk`, no `multer-s3` in `package.json` |

---

## 2. Health-check root cause

| Cause | Detail |
|-------|--------|
| Wrong probe path | Railway used `/api/health/ready` → **503** while Mongo still connecting |
| Redis in liveness | `/api/health` awaited Redis connect → probe hang on bad Redis |
| Wrong start script | `"start"` was SPA helper historically; fixed to `node server/index.js` |

**Fix:** healthcheck → `/api/health` (always 200 once listening); Redis not connected on probe; explicit startCommand.

---

## 3. AWS removal report

Removed / retired: S3 SDK, multer-s3, upload middleware, AWS env templates, S3 media defaults.  
Remaining mentions: legacy docs (marked superseded), optional `s3BaseUrl` JSON field alias (maps to `PUBLIC_MEDIA_BASE_URL` or empty), historical scripts under `scripts/` for EC2 (not used by Railway).

---

## 4. Environment variables

See `docs/ops/RAILWAY-ENV.md`. Required: `MONGODB_URI`, JWT secrets, Firebase Admin JSON (or split), admin login, CORS, `ISSUE_AUTH_BODY_TOKENS=true`. Do **not** set `AWS_*` / `S3_*`.

---

## 5. Android compatibility

- Hostname stays `https://api.net360preparation.com` (DNS cutover only).
- No intentional API/response shape changes in this migration.
- Published APK may still reference old S3 URLs for media until next store release with bundled assets; API auth/MCQ paths unchanged.

---

## 6. DNS cutover checklist

1. Railway deploy green; `/api/health` and `/api/health/ready` = 200.
2. Attach custom domain `api.net360preparation.com`.
3. Lower TTL; CNAME/ALIAS → Railway.
4. Smoke: login, admin, MCQ fetch, tests, payments webhook if used.
5. Decommission previous host after soak.
6. Rollback: repoint DNS to previous origin; pause Railway.

---

## 7. Smoke test matrix (post-cutover)

| Area | Expected | Status |
|------|----------|--------|
| `GET /api/health` | 200 | Validate on Railway URL |
| `GET /api/health/ready` | 200 with Mongo connected | Validate |
| Email / Google login | JWT issued | Validate |
| Admin login | Dashboard loads | Validate |
| MCQs / practice / tests | Mongo data | Validate |
| Media (logo, schools, guide) | Same-origin / bundled | Validate |
| Payments | Existing flow | Validate |
| Android | Same API host | Validate after DNS |

---

## 8. Rollback plan

1. DNS for `api.net360preparation.com` → previous origin.
2. Pause Railway service.
3. Confirm `/api/health` on previous host.
4. Investigate Railway logs; fix; redeploy; re-cutover.

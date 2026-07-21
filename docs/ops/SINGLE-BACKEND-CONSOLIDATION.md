# Single-backend production consolidation report

Date: 2026-07-22  
Repo tip (this commit’s parent context): see git log after push.

## Final GO / NO-GO

**NO-GO for full production cutover / regression PASS.**

Reason: Railway Main is live but **secrets are not loaded** (`env=development`, `mongo.configured=false`, `firebaseAdminConfigured=false`). Custom hostname `api.net360preparation.com` **times out**. Auth, MCQs, Admin, Mongo, and Firebase end-to-end flows cannot PASS until ops redeploys Main with Variables.

**Repo / architecture cleanup: GO** for single-backend design and AWS runtime removal.

---

## 1. Railway Service Audit

| Service | Public host (observed) | Role | Same Express? | Production traffic? |
|---------|------------------------|------|---------------|---------------------|
| **`net360-preparation`** | `net360-preparation-production-3682.up.railway.app` → `69.46.46.62` | Sole intended API | Yes — `API is running`, `/api/version` → `service: net360-api` | **Yes** (intended for `api.net360preparation.com`) |
| **`net360-admin`** | Prior host `net360-admin-production-7ac3.up.railway.app` | Second deploy of same API | Yes — historical probes returned identical root/health shape | **No** — DNS no longer resolves (2026-07-22); not on custom API domain |

### Branch / deploy

Both services historically deploy the same Express entry (`node server/index.js` from this monorepo). There is **no separate admin Express codebase**.

### Does Admin UI need `net360-admin`?

**No.** Evidence:

- Admin SPA is part of the Vite app (`src/admin/*`, chunk `admin-*.js` on Vercel).
- Routing: `src/main.tsx` (`/admin` path or `admin.*` / `net360-admin` host + optional `VITE_ADMIN_ONLY`).
- API client: `src/app/lib/api.ts` → `VITE_API_URL` / default `https://api.net360preparation.com`.
- Server already exposes `/api/admin/*` on the **same** process as student routes.

### Confirmation: is `net360-admin` required?

**Safely removable — verified redundant duplicate.**

This agent **did not delete** the Railway service (no Railway CLI token in this environment). Operator should delete it in the Railway dashboard after confirming no custom domain is attached (see `RAILWAY-SERVICES.md`).

---

## 2. Backend Consolidation Report

| Requirement | Status |
|-------------|--------|
| One Express serves student + admin | **Met in code** (`server/index.js`) |
| Duplicate Express for admin | **Not required**; `net360-admin` idle/unreachable |
| AWS S3 upload runtime | **Retired** — `POST /api/upload` → 410 after auth (`UPLOAD_RETIRED`) |
| Android API hostname | Unchanged contract — still `https://api.net360preparation.com` |

Live Main samples (2026-07-22):

| Endpoint | Result |
|----------|--------|
| `GET /` | `API is running` |
| `GET /api/health` | 200 but `env=development`, mongo/firebase **false** |
| `GET /api/health/ready` | 200 (vacuous while mongo unset) |
| `GET /api/public/media-config` | relative `/assets` / `/images` — **no S3** |
| `GET /api/subscriptions/plans` | 200 |
| `GET /api/mcqs` | 500 (`Failed to load MCQs`) — expected without Mongo |
| `POST /api/upload` | 401 without token (auth before 410) |
| `GET /api/admin/overview` | 401 without token |

---

## 3. MongoDB Verification Report

| Check | Result |
|-------|--------|
| URI loaded in running container | **FAIL** (`mongo.configured=false`) |
| Connection / collections / indexes / MCQs / practice / admin queries | **BLOCKED** |

Code path remains Mongo Atlas via `MONGODB_URI` + Mongoose models.

---

## 4. Firebase Verification Report

| Check | Result |
|-------|--------|
| Client config present in repo build samples | Project `resilience360-27f15` (Android env / prior production) |
| Client SDK reads | `VITE_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID` only |
| Firebase Admin on Railway | **FAIL** — missing service account env in running process |
| Email / Google / refresh / admin auth E2E | **BLOCKED** |

---

## 5. API Verification Report

| Area | Result |
|------|--------|
| Health | Process up; production readiness **FAIL** |
| Auth / Student / Admin authenticated routes | **BLOCKED** (Mongo + JWT + Firebase Admin) |

---

## 6. Frontend Verification Report (Vercel)

| Asset | Result |
|-------|--------|
| `www` / apex | Reachable |
| Logo `/net360-logo.png` | **PASS** `200 image/png` |
| Favicon | **PASS** |
| Guide video `/assets/videos/net360-guide.mp4` | **PASS** `200 video/mp4` ~18MB |
| Login banner | Partial transfer / large PNG (served from Vercel) |
| Admin chunk present in index | `admin-*.js` preloaded — single SPA |
| AWS/S3 media | media-config empty `s3BaseUrl` — **PASS** |

Note: browser API calls still depend on healthy `api.net360preparation.com` (or same-origin rewrite to it). Custom API host currently **times out**.

---

## 7. AWS Removal Report

| Item | Action |
|------|--------|
| `@aws-sdk` / `multer-s3` in `package.json` | Already absent |
| `server/s3.js` | Absent |
| Upload route | 410 retired |
| `VITE_S3_BASE_URL` in `.env.android` | **Removed** |
| Type + helper naming (`uploadMediaToS3`) | Cleaned → `uploadRetiredMedia` |
| EC2/PM2 deploy scripts | **Deleted** |
| Mongo backup S3 upload | **Removed** |
| Lockfile optional peer `@aws-sdk/credential-providers` (Mongo driver) | Transitive only; unused at runtime |

Legacy docs under `docs/ops/*` marked historical may still mention EC2 for incident archaeology.

---

## 8–9. Final environment variable lists

See updated `docs/ops/RAILWAY-ENV.md` (code-audited).

### Vercel (minimum)

```
VITE_API_URL=https://api.net360preparation.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

### Railway Main (minimum)

```
NODE_ENV=production
MONGODB_URI=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
FIREBASE_SERVICE_ACCOUNT_JSON=...   # or BASE64 / split fields
ADMIN_LOGIN_EMAIL=...
ADMIN_LOGIN_PASSWORD=...
CORS_ALLOWED_ORIGINS=https://www.net360preparation.com,https://net360preparation.com
ISSUE_AUTH_BODY_TOKENS=true
```

Plus `OPENAI_*` / SMTP / PayFast as needed.

---

## 10. Production smoke test results

| Surface | Result |
|---------|--------|
| Vercel static + guide video | **PASS** |
| Railway Main process | **UP / misconfigured** |
| `api.net360preparation.com` | **FAIL** timeout |
| Mongo / Firebase / Auth / Admin / Student data paths | **FAIL / BLOCKED** |
| Android contract | Unchanged; blocked until API host healthy |

---

## Operator checklist (to reach GO)

1. Railway → **`net360-preparation`** → Production Variables (list above).
2. **Redeploy** (required — long uptime without secrets).
3. Confirm `/api/health`: `env=production`, mongo connected, Firebase Admin true.
4. Smoke login (email + Google), admin login, MCQs, community.
5. Point / verify `api.net360preparation.com` → Main.
6. Delete **`net360-admin`** in Railway dashboard (verified redundant).

# Production Verification — After Railway Redeploy

Date: 2026-07-21 (live probes)

## Commit / push status

All today’s code changes are already committed and pushed. Working trees clean.

| Branch | Commit | Remote |
|--------|--------|--------|
| `main` | `bfd34ee` | synced |
| `web-production` | `887c78e` | synced |
| `android-production` | `9f43833` | synced |
| `android-build` | `739021c` | synced |

No further commit was required for this verification pass.

---

## Final GO / NO-GO

**NO-GO for DNS cutover.**

Railway Main process is **still not running with production secrets**, despite Variables appearing in the Railway UI earlier.

| Gate | Result |
|------|--------|
| Health HTTP | PASS |
| `env=production` | **FAIL** (`development`) |
| `mongo.configured=true` | **FAIL** |
| `mongo.connected=true` | **FAIL** |
| `firebaseAdminConfigured=true` | **FAIL** |
| Guide video on Vercel | **PASS** |
| Logos on Vercel | **PASS** |
| `api.net360preparation.com` | **FAIL** (timeout) |
| Auth / Admin / Student / Mongo data | **BLOCKED** (no DB / Firebase Admin) |

---

## 1. Runtime environment verification (live container)

Probe: `https://net360-preparation-production-3682.up.railway.app/api/health`

| Check | Expected | Observed |
|-------|----------|----------|
| `NODE_ENV` / `env` | `production` | **`development`** |
| Mongo URI loaded | configured | **`configured: false`** |
| Mongo connected | true | **false** |
| Firebase Admin | true | **false** — missing `FIREBASE_SERVICE_ACCOUNT_JSON` (or split) |
| Socket.IO | true | **true** |
| JWT / Admin / CORS / `ISSUE_AUTH_BODY_TOKENS` | cannot introspect via health | **unknown** — process clearly missing core secrets |

**Root cause:** Running container uptime ~3162s with empty Mongo/Firebase → **new Variables were not applied to this process**. Railway requires a **Redeploy** (or new deployment) after adding/changing Variables. Confirm Variables are on service **`net360-preparation`** / environment **`production`**, then Redeploy and re-check health.

Admin service (`net360-admin`) health also shows `env=development`, mongo false — keep idle; do not use for production.

---

## 2. Health endpoint verification

Base: `https://net360-preparation-production-3682.up.railway.app`

| Path | HTTP | Body |
|------|------|------|
| `/` | 200 | `API is running` |
| `/health` | 200 | `{"status":"ok"}` |
| `/api/health` | 200 | ok, but env/mongo/firebase **wrong** |
| `/api/health/ready` | 200 | `ready` only because mongo not configured (vacuous ready) |

Also: `/api/test` 200, `/api/version` `env=development`, `/api/public/media-config` same-origin paths (no S3).

---

## 3. MongoDB verification

**BLOCKED** — URI not loaded in running API. Cannot enumerate users/MCQs/subscriptions via API until Mongo connects.

Code path remains Mongo-only (`server/models/MCQ.js`).

---

## 4–6. Auth / Admin / Student

**BLOCKED** — Firebase Admin + Mongo + JWT required. Do not invent pass/fail without live secrets.

---

## 7. Frontend media verification (Vercel)

| Asset | Result |
|-------|--------|
| `https://www.net360preparation.com/assets/videos/net360-guide.mp4` | **PASS** — `200`, `video/mp4`, length `18204719` |
| `https://www.net360preparation.com/net360-logo.png` | **PASS** — `200`, `image/png` |
| media-config defaults | relative `/assets/...`, `/images/...` — no S3/CloudFront |

---

## 8. Android compatibility

No API contract changes in today’s commits. Existing Play Store app should keep working **once** `api.net360preparation.com` points at a healthy Railway Main with secrets. Device retest after DNS cutover.

---

## 9. DNS cutover checklist (do not cut over yet)

- [ ] Redeploy Railway Main after Variables
- [ ] `/api/health` → `env=production`
- [ ] `/api/health` → `mongo.configured=true` and `connected=true`
- [ ] `/api/health` → `firebaseAdminConfigured=true`
- [ ] Email + Google login with existing accounts
- [ ] Admin login + dashboard
- [ ] MCQ list from API
- [ ] Guide video + logos (already PASS on Vercel)
- [ ] Then point `api.net360preparation.com` → Railway Main
- [ ] Keep `net360-admin` idle

---

## Minimum fix (ops)

1. Railway → `net360-preparation` → Variables: confirm `NODE_ENV=production`, `MONGODB_URI`, Firebase Admin, JWTs, admin login, CORS, `ISSUE_AUTH_BODY_TOKENS=true`.
2. **Deployments → Redeploy**.
3. Re-run `GET .../api/health` until Mongo + Firebase + production are green.
4. Smoke auth/admin/MCQs.
5. DNS cutover.

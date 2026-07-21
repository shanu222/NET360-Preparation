# NET360 Final Production Stabilization Report

Date: 2026-07-21  
Branch work: `main` (NET360-main-push)

## GO / NO-GO

**NO-GO for DNS cutover until Railway Main loads production secrets.**

| Gate | Status |
|------|--------|
| Health endpoint green | PASS (HTTP 200) |
| Mongo connected on Railway | **FAIL** — live `/api/health` still `mongo.configured=false` |
| Firebase Admin configured | **FAIL** — live health `firebaseAdminConfigured=false` |
| `NODE_ENV=production` | **FAIL** — live health `env=development` |
| Guide video file in repo | **PASS** (restored) |
| Guide video on live Vercel | **FAIL until Vercel redeploy** (was SPA HTML fallback) |
| AWS runtime SDK | PASS (removed earlier) |
| Duplicate Railway Admin | Documented idle — not required |
| API contract changes | None in this phase |

**Action required (ops, not code):** Railway Variables UI shows secrets, but the **running container does not have them**. Click **Redeploy** on `net360-preparation`, then verify:

```text
GET https://net360-preparation-production-3682.up.railway.app/api/health
→ env=production, mongo.configured=true, firebaseAdminConfigured=true
```

Then attach/cut over `api.net360preparation.com`.

---

## 1. Duplicate Railway service analysis

| Service | What it is | Required? |
|---------|------------|-----------|
| `net360-preparation` | Express API | **Yes** |
| `net360-admin` | Same Express API clone | **No** — keep idle, do not delete |

Admin UI: Vite `AdminApp` via `/admin` on Vercel (or admin host + `VITE_ADMIN_ONLY`). Calls Main via `VITE_API_URL`.  
Doc: `docs/ops/RAILWAY-SERVICES.md`

---

## 2. Guide video fix report

| Item | Detail |
|------|--------|
| Root cause | `public/assets/videos/net360-guide.mp4` **deleted** in commit `cbc8478` (“remove bundled net360-guide.mp4 (S3-hosted media)”). Folder only had README. |
| Live symptom | `GET /assets/videos/net360-guide.mp4` on Vercel → **200 `text/html`** (SPA rewrite), not `video/mp4` |
| Fix | Restored ~17.4 MB file from git history (`cbc8478^`). Updated `Net360UserGuideVideo.tsx` for bundled-first playback. |
| Follow-up | Redeploy **Vercel** so the asset ships. |

---

## 3. AWS removal report

| Check | Result |
|-------|--------|
| Direct `@aws-sdk` / `multer-s3` deps | Absent |
| Upload route | 410 `UPLOAD_RETIRED` (path kept for Android/admin contract) |
| Remaining | Docs cleanup; Mongo driver optional peer `@aws-sdk/credential-providers` in lockfile (unused); deprecated `VITE_S3_BASE_URL` type only |
| Runtime AWS | **Zero** |

---

## 4. Static media report

| Asset class | Location | Status |
|-------------|----------|--------|
| Logos / icons | `public/` | Present |
| Schools / images | `public/schools`, `public/images` | Present |
| Guide video | `public/assets/videos/net360-guide.mp4` | **Restored** |
| Resolver | `src/app/lib/publicMedia.ts` | Same-origin paths |

---

## 5. MCQ validation

MCQs use `server/models/MCQ.js` + API routes → MongoDB Atlas only. No JSON bank loader in runtime path.

---

## 6. Auth / Admin / API

No auth or API contract changes in this phase.  
`ISSUE_AUTH_BODY_TOKENS`, Firebase Admin, JWT must be live on Railway after redeploy for existing users to continue.

---

## 7. Environment cleanup

| Host | Guidance |
|------|----------|
| Railway Main | Backend only; `VITE_API_URL` unused at runtime — safe to remove from service vars |
| Railway Admin | Idle — no production vars required |
| Vercel | Frontend `VITE_*` only (your Firebase + API URL board is correct) |

---

## 8. Smoke test matrix (automated probes)

| Test | Result | Notes |
|------|--------|-------|
| Railway `/` | PASS | `API is running` |
| Railway `/api/health` | PASS HTTP / **FAIL readiness data** | Mongo/Firebase/NODE_ENV not applied |
| Vercel site | PASS | 200 |
| Guide video on Vercel | FAIL | HTML until redeploy with file |
| `api.net360preparation.com` | FAIL (earlier timeout) | Cutover after Main is ready |
| Auth / MCQ / Admin UI | BLOCKED | Need Mongo + Firebase on Railway |

---

## 9. Success criteria remapping

| Criterion | Status |
|-----------|--------|
| Main only required backend | Met (documented) |
| Admin duplicate idle | Met |
| AWS runtime gone | Met |
| Guide video bundled | Met in repo; deploy pending |
| Mongo-only MCQs | Met in code |
| Existing users work | **Pending Railway secret load + redeploy** |
| Android unchanged APIs | Met (no contract edits) |
| DNS cutover ready | **NO-GO until health shows Mongo + Firebase + production** |

# Production auth timeout — root cause & recovery

Date: 2026-07-22  
Symptom: `POST https://api.net360preparation.com/api/auth/login` → `net::ERR_CONNECTION_TIMED_OUT`

## Root cause (verified)

| Check | Result |
|-------|--------|
| `api.net360preparation.com` DNS (Google 8.8.8.8) | **A** `13.233.216.163` |
| Reverse DNS of that IP | `ec2-13-233-216-163.ap-south-1.compute.amazonaws.com` (**retired AWS EC2**) |
| TCP 443 to `13.233.216.163` | **FAIL** (timeout) — explains browser `ERR_CONNECTION_TIMED_OUT` |
| Railway Main public host | `net360-preparation-production-3682.up.railway.app` → `69.46.46.62` |
| TCP 443 to Railway | **OK** |
| `GET …railway.app/api/health` | **200** process up |
| Health payload | `env=development`, `mongo.configured=false`, `firebaseAdminConfigured=false` |
| `POST …railway.app/api/auth/login` | Responds (no timeout) but **500** without Mongo/secrets |

**Primary timeout cause:** DNS for `api.net360preparation.com` still points at **dead EC2**, not Railway.

**Secondary auth blocker:** Even after traffic reaches Railway, the running container has **not loaded** production secrets (needs Variables + **Redeploy**).

This is **not** a Firebase client bug. Email and Google login both need the backend.

---

## Operator fix A — DNS (required for Android + canonical host)

1. DNS provider for `net360preparation.com`:
   - **Delete** any **A/AAAA** record for `api` → `13.233.216.163` (and any other stale API targets).
2. Railway → service **`net360-preparation`** → Settings → **Custom Domain** → add `api.net360preparation.com` if missing.
3. Add the **CNAME** (+ **TXT** `_railway-verify…`) exactly as Railway shows (usually CNAME `api` → `*.up.railway.app` or the dashboard target).
4. Wait for propagation / Railway SSL **ISSUED**.
5. Verify:
   ```bash
   nslookup api.net360preparation.com 8.8.8.8
   # must NOT be 13.233.216.163
   curl -sS https://api.net360preparation.com/api/health
   ```

Railway does **not** use a static A record for custom domains — use their CNAME.

---

## Operator fix B — Railway secrets + redeploy (required for login success)

On **`net360-preparation`** / Production environment:

```
NODE_ENV=production
MONGODB_URI=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
FIREBASE_SERVICE_ACCOUNT_JSON=...   # or BASE64 / PROJECT_ID+CLIENT_EMAIL+PRIVATE_KEY
ADMIN_LOGIN_EMAIL=...
ADMIN_LOGIN_PASSWORD=...
CORS_ALLOWED_ORIGINS=https://www.net360preparation.com,https://net360preparation.com
ISSUE_AUTH_BODY_TOKENS=true
```

Then **Redeploy** (Variables do not apply to the already-running process).

Target health:

```json
"env": "production",
"mongo": { "configured": true, "connected": true },
"firebaseAdminConfigured": true
```

---

## Code mitigation (web only)

Until DNS is fixed, the Vercel SPA temporarily calls the live Railway URL when `VITE_API_URL` still says `api.net360preparation.com`.

- **Native/Android** continues to use `https://api.net360preparation.com` (contract unchanged) — **Android still needs DNS fix A**.
- `vercel.json` `/api/*` rewrite also targets the live Railway host.

**Remove the web bridge** in `src/app/lib/api.ts` once `api.net360preparation.com` resolves to Railway and health is green.

---

## Auth flow status after fixes

| Step | After DNS only | After DNS + secrets |
|------|----------------|---------------------|
| Reach `/api/auth/login` | No timeout | No timeout |
| Mongo user lookup | Fail/500 | OK |
| Password / Firebase Admin verify | Fail | OK |
| JWT + refresh | Fail | OK |
| Email + Google login | Fail | OK |

No API contract changes. No user migrations.

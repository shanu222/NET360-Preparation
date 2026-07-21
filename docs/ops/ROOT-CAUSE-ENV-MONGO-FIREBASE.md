# Root Cause Analysis — Railway env / Mongo / Firebase

Date: 2026-07-21  
Live probe host: `https://net360-preparation-production-3682.up.railway.app`

## Executive root cause

**The running Node process does not have production secrets in `process.env`.**

Evidence from live `/api/health` (same pattern across probes):

| Field | Observed | Meaning |
|-------|----------|---------|
| `build.env` | `development` | `process.env.NODE_ENV` is **unset** (code defaults to `development`) **or** explicitly `development` |
| `mongo.configured` | `false` | `connectMongo()` never received a non-empty URI → `lastUri` stays empty |
| `firebaseAdminConfigured` | `false` | `resolveFirebaseAdminCredential()` returned `null` at module load |
| `firebaseAdminMissingEnv` | lists JSON/BASE64/split | Confirms **no** Firebase Admin credential vars in process |
| `uptimeSec` | ~3600+ | Container **was not restarted** for a long time after Variable UI edits |

This is **not** a Mongo Atlas outage and **not** a Firebase API failure.  
`mongo.configured=false` means **URI absent in the process**, not “URI present but connection failed.”  
(If URI were present and connect failed, `configured` would be `true` and `connected` false.)

---

## How health maps to runtime (code evidence)

### `env` / `NODE_ENV`

```js
// server/index.js
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();

// server/lib/buildInfo.js → health.build.env
env: String(process.env.NODE_ENV || 'development'),
```

Unset `NODE_ENV` → reports `development`. Code does **not** force development when Railway sets `production`.

`dotenv.config()` is called **without** `override: true`, so it **cannot** overwrite Railway-injected vars. No committed `.env` is loaded on Railway (`.env` gitignored; server does not load `.env.production`).

### `mongo.configured`

```js
// server/lib/mongo.js
export function getMongoHealth() {
  return { configured: Boolean(lastUri), connected: readyState === 1, ... };
}
// lastUri is set only inside connectMongo(uri) when uri is non-empty
```

URI read order in `server/index.js`:

1. `MONGODB_URI`
2. `DATABASE_URL`
3. `MONGO_URI`

### `firebaseAdminConfigured`

Init order in `resolveFirebaseAdminCredential()`:

1. `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_ADMIN_CREDENTIALS_JSON`)
2. `FIREBASE_SERVICE_ACCOUNT_BASE64`
3. `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (supports `\\n` → newline)
4. `GOOGLE_APPLICATION_CREDENTIALS` file path (not suitable on Railway without a file)

Failures are logged; result is `null` → `firebaseAdminConfigured: false`.

---

## Exact variable names the code expects

| Purpose | Names (first wins) |
|---------|-------------------|
| Mongo | `MONGODB_URI` \| `DATABASE_URL` \| `MONGO_URI` |
| JWT | `JWT_SECRET`, `JWT_REFRESH_SECRET` |
| Firebase (preferred) | `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Firebase (alt) | `FIREBASE_SERVICE_ACCOUNT_BASE64` |
| Firebase (split) | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Admin login | `ADMIN_LOGIN_EMAIL` / `ADMIN_LOGIN_PASSWORD` (aliases `ADMIN_*`, `BOOTSTRAP_ADMIN_*`) |
| CORS | `CORS_ALLOWED_ORIGINS` \| `NET360_CORS_ORIGINS` |
| Tokens for Android | `ISSUE_AUTH_BODY_TOKENS=true` |

Vercel `VITE_FIREBASE_*` are **client-only** and do **not** initialize Firebase Admin.

---

## Why Variables in the UI still yield empty process.env

Most likely failure chain (ordered by evidence):

1. **Running deploy predates Variable application / no successful restart**  
   High `uptimeSec` while health shows empty Mongo/Firebase/`development` means this PID never received a fresh env injection.

2. **Variables on wrong service**  
   Must be on **`net360-preparation`**, not only `net360-admin`.

3. **Wrong Railway environment**  
   Must be **Production** for the public `*-production-*.up.railway.app` URL.

4. **Less likely:** `NODE_ENV` explicitly set to `development` **and** Mongo/Firebase vars empty/misnamed — still consistent with “this process never got the Production variable set.”

Not caused by:

- dotenv wiping Railway secrets (no override)
- Health lying about connection errors (configured flag is URI presence)
- Need for business-logic refactor

---

## Required fix (ops + small diagnostic)

1. Railway → service **`net360-preparation`** → environment **`production`**.
2. Confirm exact names above (especially `MONGODB_URI`, `NODE_ENV=production`, Firebase split **or** JSON).
3. **Deployments → Redeploy** (mandatory). Confirm new deploy `uptimeSec` resets to a low number.
4. Hit `/api/health` and check new `envPresence` object (booleans only, no secrets).

### Expected after successful fix

```json
"build": { "env": "production" },
"mongo": { "configured": true, "connected": true },
"firebaseAdminConfigured": true,
"envPresence": {
  "NODE_ENV": true,
  "NODE_ENV_VALUE": "production",
  "MONGODB_URI": true,
  "JWT_SECRET": true,
  "FIREBASE_PROJECT_ID": true,
  "FIREBASE_CLIENT_EMAIL": true,
  "FIREBASE_PRIVATE_KEY": true
}
```

If `envPresence.MONGODB_URI` is still `false` after redeploy → Variables are still not on this service/environment (or name mismatch).  
If `MONGODB_URI` is `true` but `connected` is `false` → then debug Atlas URI/network (different problem).

---

## Final GO / NO-GO

**NO-GO** for DNS cutover until live health shows:

- `env=production`
- `mongo.configured=true` and `mongo.connected=true`
- `firebaseAdminConfigured=true`

Then re-test login, admin, MCQs, Android against the Railway URL before pointing `api.net360preparation.com`.

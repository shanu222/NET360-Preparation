# Railway / Vercel environment variables (code-audited)

**Never commit secrets.** Set values in the host UI only.

## Vercel (frontend) — variables the SPA actually reads

Required:

| Variable | Used by |
|----------|---------|
| `VITE_API_URL` | `src/app/lib/api.ts` (alias: `VITE_API_BASE_URL`) — prefer `https://api.net360preparation.com` |
| `VITE_FIREBASE_API_KEY` | `src/app/lib/firebase.ts` |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |

Optional (only if you intentionally override defaults):

| Variable | Used by |
|----------|---------|
| `VITE_MANUAL_SUBSCRIPTION_WHATSAPP` | `SubscriptionPage.tsx` |
| `VITE_PUBLIC_MEDIA_BASE_URL` | `publicMedia.ts` (prefer unset — use bundled `/assets`) |
| `VITE_BRAND_LOGO_URL` / `VITE_USER_GUIDE_VIDEO_URL` / `VITE_LOGIN_BANNER_URL` / `VITE_APP_PROMO_IMAGE_URL` / `VITE_APP_PROMO_ASSET_VERSION` | media overrides |
| `VITE_ENABLE_PUSH_NOTIFICATIONS` | `nativeMobile.ts` (Android; default off) |
| `VITE_ADMIN_ONLY` | `main.tsx` — only for a dedicated admin SPA build (not needed on student Vercel) |
| `VITE_MEDIA_LOCAL_FALLBACK` | media fallbacks |

**Do not set on Vercel:** JWT secrets, `MONGODB_URI`, Firebase Admin JSON, `ADMIN_LOGIN_*`, AWS/S3 keys.

**Not read by current client Firebase init** (safe to omit): `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_MEASUREMENT_ID`.

---

## Railway (`net360-preparation` only) — variables the API actually reads

### Required for production

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | Must be `production` |
| `MONGODB_URI` | Atlas URI (aliases also read: `DATABASE_URL`, `MONGO_URI`) |
| `JWT_SECRET` | |
| `JWT_REFRESH_SECRET` | |
| `ADMIN_LOGIN_EMAIL` | aliases: `ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_EMAIL` |
| `ADMIN_LOGIN_PASSWORD` | aliases: `ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD` |
| `CORS_ALLOWED_ORIGINS` | alias: `NET360_CORS_ORIGINS` — include Vercel origins |
| `ISSUE_AUTH_BODY_TOKENS` | `true` (Android body tokens) |
| Firebase Admin | **one of:** `FIREBASE_SERVICE_ACCOUNT_JSON` **or** `FIREBASE_SERVICE_ACCOUNT_BASE64` **or** `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` |

Railway also injects `PORT` / `RAILWAY_*` automatically.

### Strongly recommended

| Variable | Notes |
|----------|--------|
| `OPENAI_API_KEY` | or `MODEL_PROVIDER_API_KEY` |
| `OPENAI_MODEL` | or `MODEL_PROVIDER_MODEL` |
| `SECURITY_ANSWER_ENCRYPTION_KEY` | password recovery |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | |
| `NET360_PUBLIC_APP_URL` | email/deep links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM_EMAIL` / `SMTP_SECURE` | mail |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_SECURED_KEY` / `PAYFAST_BASE_URL` | payments |
| `PAYFAST_CHECKOUT_DISABLED` | default `true` until ready |
| `MANUAL_SUBSCRIPTION_WHATSAPP` | |
| `SUBSCRIPTION_TRIAL_DAYS` | |
| `REDIS_URL` | optional Socket.IO scale-out |

### Do not set on Railway

- Any `VITE_*` (frontend build-time only)
- `AWS_*`, `S3_*`, CloudFront, EC2 paths
- Secrets belonging only to a deleted `net360-admin` service

After changing Variables: **Redeploy** `net360-preparation` and confirm `/api/health` shows `env=production`, `mongo.configured=true`, `firebaseAdminConfigured=true`.

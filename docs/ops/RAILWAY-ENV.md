# Railway environment variables

**Never commit secrets.** Set these in the Railway service Variables UI.

## Required

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Same Atlas cluster as production |
| `JWT_SECRET` | Strong secret |
| `JWT_REFRESH_SECRET` | Strong secret |
| `ADMIN_LOGIN_EMAIL` | |
| `ADMIN_LOGIN_PASSWORD` | |
| `CORS_ALLOWED_ORIGINS` | Vercel production origins (comma-separated) |
| `ISSUE_AUTH_BODY_TOKENS` | `true` (required for Android) |

## Firebase Admin (pick one style)

| Variable | Notes |
|----------|--------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Preferred — full JSON string |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Alternative |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | Split fields |

## Strongly recommended

| Variable | Notes |
|----------|--------|
| `ACCESS_TOKEN_TTL` | default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | |
| `SECURITY_ANSWER_ENCRYPTION_KEY` | |
| `CONFIG_ENCRYPTION_KEY` | if used |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | AI features |
| `SMTP_*` | password recovery / delete link |
| `PAYFAST_*` / `PAYFAST_CHECKOUT_DISABLED` | payments |
| `SUBSCRIPTION_TRIAL_DAYS` / `PREMIUM_PLAN_DURATION_MONTHS` | |
| `SUBSCRIPTION_PREMIUM_SURFACE_BYPASS` | match prior production |
| `MANUAL_SUBSCRIPTION_WHATSAPP` | |

## Optional

| Variable | Notes |
|----------|--------|
| `REDIS_URL` or `REDIS_HOST`+creds | Leave empty for Mongo-only |
| `TWILIO_*` | if used |
| `PUBLIC_*` media URL overrides | prefer empty (bundled assets) |
| `GIT_COMMIT` / `DEPLOYED_AT` | build metadata |

## Do not set on Railway (removed / unused)

`AWS_*`, `S3_*`, `AWS_PUBLIC_BASE_URL`, `S3_BACKUP_BUCKET`, `S3_OBJECT_ACL`, `GOOGLE_APPLICATION_CREDENTIALS` (prefer JSON env), PM2/`NET360_LOG_DIR` paths, `VITE_*` (Vite vars belong on Vercel / Android CI, not the API service).

## Vercel (web)

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | `https://api.net360preparation.com` |
| `VITE_FIREBASE_*` | client SDK |
| `VITE_S3_BASE_URL` | **unset** |

## Android build

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | `https://api.net360preparation.com` |
| `VITE_FIREBASE_*` | required |
| `VITE_S3_BASE_URL` | **not required** |

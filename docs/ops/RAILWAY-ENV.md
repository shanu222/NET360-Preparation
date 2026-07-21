# Railway environment variables (from EC2 audit)

Copy values from the live EC2 host. **Never commit secrets.**

## Required

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Same Atlas cluster as today |
| `JWT_SECRET` | Rotate if ever exposed |
| `JWT_REFRESH_SECRET` | Rotate if ever exposed |
| `ADMIN_LOGIN_EMAIL` | |
| `ADMIN_LOGIN_PASSWORD` | |
| `CORS_ALLOWED_ORIGINS` | Vercel production origins (comma-separated) |
| `ISSUE_AUTH_BODY_TOKENS` | `true` (Android) |

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
| `SUBSCRIPTION_PREMIUM_SURFACE_BYPASS` | match EC2 |
| `MANUAL_SUBSCRIPTION_WHATSAPP` | |

## Optional

| Variable | Notes |
|----------|--------|
| `REDIS_URL` or `REDIS_HOST`+creds | Leave empty for Mongo-only |
| `TWILIO_*` | if used |
| `GIT_COMMIT` / `DEPLOYED_AT` | build metadata |

## Removed (do not set on Railway)

`AWS_*`, `S3_*`, `AWS_PUBLIC_BASE_URL`, `S3_BACKUP_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS` (prefer JSON env), PM2/`NET360_LOG_DIR` EC2 paths.

## Vercel (web)

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | `https://api.net360preparation.com` |
| `VITE_FIREBASE_*` | client SDK |
| `VITE_S3_BASE_URL` | **unset** after static assets are bundled |

## Android build

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | `https://api.net360preparation.com` |
| `VITE_FIREBASE_*` | required |
| `VITE_S3_BASE_URL` | **not required** after bundling |


# NET360 Preparation App

This is the NET360 Preparation App codebase. The UI source design reference is available at:
https://www.figma.com/design/y9bYMsJLVtoN2SMwfEKBLc/NET360-Preparation-App

## Local Development

1. Install dependencies:
`npm install`

2. Start frontend:
`npm run dev`

3. Start backend API:
`npm run dev:server`

Note: Set `VITE_API_URL` (for example `http://localhost:5000`) in `.env` or `.env.development` so the Vite dev proxy forwards `/api/*` to your API. If unset, the proxy is disabled.

Frontend runs on Vite, backend runs on Express.

## Android App (Capacitor)

This repository includes a native Android shell that runs the same frontend and connects to the same backend APIs/database.

1. Build and sync Android project:
`npm run mobile:build`

This command builds using Vite Android mode (`--mode android`) and reads Android-specific env values from `.env.android` / `.env.android.local`.

2. Open Android Studio:
`npm run android:open`

3. Optional sync after frontend updates:
`npm run android:sync`

Full manual setup and release steps are documented in `ANDROID_SETUP.md`.

Optional native plugin support is included for splash screen, status bar styling, haptics, and push notifications.

The app now includes a first-time onboarding gate that requires users to accept Terms and Conditions and acknowledge/request required permissions before entering the platform.

## Required External Setup (Production)

These are required for the new production-grade features:

1. MongoDB database (Atlas or self-hosted)
2. Model provider API key (for Smart Study Mentor live responses)
3. Separate backend deployment service (or a single service running both frontend and API via reverse proxy)

## Environment Variables

Create environment variables for backend service:

- `MONGODB_URI` = your Mongo connection string
- `JWT_SECRET` = strong random secret for access tokens
- `JWT_REFRESH_SECRET` = strong random secret for refresh tokens
- `ACCESS_TOKEN_TTL` = optional, default `15m`
- `REFRESH_TOKEN_TTL_DAYS` = optional, default `30`
- `MODEL_PROVIDER_API_KEY` = required for live Smart Study Mentor
- `MODEL_PROVIDER_MODEL` = optional, default `gpt-4o-mini`
- `SMART_DAILY_LIMIT` = optional, default `50`
- Firebase Auth (required for user auth):
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` (single-line value with escaped `\n`)
- Admin access:
  - Env login (recommended): set `ADMIN_LOGIN_EMAIL` + `ADMIN_LOGIN_PASSWORD` on API service
  - When env credentials are used, backend auto-creates/promotes admin user and syncs password on successful login
  - Aliases also supported: `ADMIN_EMAIL`/`ADMIN_PASSWORD` and `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`
  - Optional `BOOTSTRAP_ADMIN_FORCE_PASSWORD_RESET=true` keeps startup bootstrap password sync enabled
- `API_PORT` = optional when `PORT` is unset; server default is `5000`
- CORS is handled in `server/index.js` with **`cors({ origin: true, credentials: true })`** so the API echoes the browser `Origin`. If **Nginx (or Cloudflare)** also adds `Access-Control-Allow-Origin`, browsers may see **two values** (comma-separated) and block the request. Fix: **remove `add_header Access-Control-*` from nginx** for locations that proxy to Node, or set **`DISABLE_EXPRESS_CORS=true`** on the API and set CORS **once** in nginx only. See `deploy/nginx-api-proxy.example.conf`.
- `MAX_JSON_BODY_MB` = optional request body limit, default `10`
- `REQUEST_TIMEOUT_MS` = optional API request timeout in milliseconds, default `30000`

Frontend environment variable:

- `VITE_API_URL` = required API base URL for web and native builds (for production use `https://api.net360preparation.com`, **not** the static Vercel site URL).
  - **`VITE_API_BASE_URL`** is accepted as an **alias** if `VITE_API_URL` is unset (some dashboards used the wrong name).
  - Local dev: usually backend URL (for example `http://localhost:5000`).
  - Vercel: set **`VITE_API_URL`** to `https://api.net360preparation.com` (and keep Firebase `VITE_*` vars). You do **not** need backend secrets on Vercel.
- Firebase client config:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`

For Android packaging, create `.env.android` from `.env.android.example`.

## Render Deployment (Recommended Split)

Deploy as two Render services:

1. Backend API service
- Build: `npm install`
- Start: `npm run start:server`
- Add all backend env vars above

2. Frontend web service
- Build: `npm install && npm run build`
- Start: `npx vite preview --host 0.0.0.0 --port $PORT`
- Add `VITE_API_URL`:
  - Render/static hosts: backend service URL
  - Vercel frontend: frontend origin, with `vercel.json` `/api/*` rewrite to backend

## Production API Connectivity Checklist

If admin/client requests fail with network errors in production:

1. Verify frontend base URL variables
- `VITE_API_URL` should match how traffic is routed:
  - Direct API mode: `https://api.net360preparation.com`
  - Vercel proxy mode: `https://<your-frontend-domain>` with `/api/*` rewrite to API

2. Verify backend CORS
- Express uses **dynamic `Origin` reflection** — no `CORS_ALLOWED_ORIGINS` env. If you still see CORS errors, check **Nginx** is not returning an old 403 body or static `Access-Control-Allow-Origin` for `/api` (remove duplicate CORS headers; proxy to Node only).

3. Verify API routes and health
- Admin AI generation route: `POST /api/admin/ai-generate-mcq`
- Health route: `GET /api/health` (must return JSON)

4. Free-tier sleep/wake behavior
- First request can take longer while backend wakes up
- Frontend includes retry/backoff for transient timeouts and `5xx` responses
- If wake-up delays are frequent, consider an always-on plan for API service

## New Production Features Added

- MongoDB model-based persistence with indexes
- JWT access + refresh token auth flow
- Rate limiting and helmet hardening
- Input payload sanitization and prototype pollution key stripping
- Security startup validation for weak secrets/CORS in production
- Additional endpoint-level abuse rate limits (auth + AI routes)
- Mongo query hardening (`strictQuery` + `sanitizeFilter`) and connection stability tuning
- Smart Study Mentor backend integration with daily usage limits
- Study plan generation API with account persistence
- Admin APIs + Admin Panel UI for MCQ and analytics oversight
  
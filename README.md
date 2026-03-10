
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

Frontend runs on Vite, backend runs on Express.

## Android App (Capacitor)

This repository includes a native Android shell that runs the same frontend and connects to the same backend APIs/database.

1. Build and sync Android project:
`npm run mobile:build`

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
- `ADMIN_EMAILS` = comma-separated admin emails, for example `admin@net360.pk,ops@net360.pk`
- `API_PORT` = optional, default `4000`
- `CORS_ALLOWED_ORIGINS` = comma-separated allowed frontend origins in production
- `MAX_JSON_BODY_MB` = optional request body limit, default `10`
- `REQUEST_TIMEOUT_MS` = optional API request timeout in milliseconds, default `30000`

Frontend environment variable:

- `VITE_API_BASE_URL` = full backend URL in production, for example `https://net360-api.onrender.com`
- `VITE_MOBILE_API_BASE_URL` = optional native override for Android/iOS builds
- `VITE_DISABLE_LOCAL_API_FALLBACK` = set `true` for production mobile builds to require live backend

For Android packaging, use `.env.android.example` as a baseline.

## Render Deployment (Recommended Split)

Deploy as two Render services:

1. Backend API service
- Build: `npm install`
- Start: `npm run start:server`
- Add all backend env vars above

2. Frontend web service
- Build: `npm install && npm run build`
- Start: `npx vite preview --host 0.0.0.0 --port $PORT`
- Add `VITE_API_BASE_URL` pointing to backend service URL

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
  
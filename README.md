
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

## Required External Setup (Production)

These are required for the new production-grade features:

1. MongoDB database (Atlas or self-hosted)
2. OpenAI API key (for AI Mentor live responses)
3. Separate backend deployment service (or a single service running both frontend and API via reverse proxy)

## Environment Variables

Create environment variables for backend service:

- `MONGODB_URI` = your Mongo connection string
- `JWT_SECRET` = strong random secret for access tokens
- `JWT_REFRESH_SECRET` = strong random secret for refresh tokens
- `ACCESS_TOKEN_TTL` = optional, default `15m`
- `REFRESH_TOKEN_TTL_DAYS` = optional, default `30`
- `OPENAI_API_KEY` = required for live AI Mentor
- `OPENAI_MODEL` = optional, default `gpt-4o-mini`
- `AI_DAILY_LIMIT` = optional, default `50`
- `ADMIN_EMAILS` = comma-separated admin emails, for example `admin@net360.pk,ops@net360.pk`
- `API_PORT` = optional, default `4000`

Frontend environment variable:

- `VITE_API_BASE_URL` = full backend URL in production, for example `https://net360-api.onrender.com`

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
- AI Mentor backend integration with daily usage limits
- Study plan generation API with account persistence
- Admin APIs + Admin Panel UI for MCQ and analytics oversight
  
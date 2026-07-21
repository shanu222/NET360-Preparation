# Railway production deployment — NET360 API

## Service settings

| Setting | Value |
|---------|--------|
| Root directory | repository root |
| Start command | `node server/index.js` |
| Health check | `GET /api/health/ready` |
| Custom domain | `api.net360preparation.com` |

Do **not** use `npm start` (that runs the SPA helper). Use `start:server` / `node server/index.js` only.

## DNS cutover

1. Deploy this service on Railway and confirm `https://<railway-host>/api/health/ready` returns 200.
2. Add custom domain `api.net360preparation.com` in Railway.
3. Lower TTL on the existing DNS record.
4. Point `api.net360preparation.com` CNAME/ALIAS to the Railway domain.
5. Keep EC2 running until smoke tests pass (24–48h).
6. Decommission EC2 after soak.

## Firebase Admin (no credential file in the repo)

Set **one** of:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — full service account JSON as a single-line string
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — base64 of that JSON
- Or `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (use `\n` for newlines)

Optional legacy (local/EC2 only): `GOOGLE_APPLICATION_CREDENTIALS` file path.

## Required secrets (copy from EC2; do not commit)

See `docs/ops/RAILWAY-ENV.md`.

## Rollback

Repoint DNS for `api.net360preparation.com` back to EC2. Pause/stop the Railway service.

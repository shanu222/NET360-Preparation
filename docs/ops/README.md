# Ops docs index

## Current production (Railway)

| Doc | Purpose |
|-----|---------|
| [RAILWAY.md](./RAILWAY.md) | Deploy, health check, DNS cutover, rollback |
| [RAILWAY-ENV.md](./RAILWAY-ENV.md) | Environment variables for Railway / Vercel / Android |
| [RAILWAY-SERVICES.md](./RAILWAY-SERVICES.md) | Main vs Admin — Admin is idle / not required |

Topology: **Vercel (web) → Railway (API) → MongoDB Atlas**. Auth: Firebase + JWT.

## Legacy (EC2 + PM2 — superseded)

The following runbooks describe the previous EC2 host. Do not use them for new production deploys.

| Doc | Purpose |
|-----|---------|
| [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) | Historical EC2 deploy checklist |
| [MONITORING-DASHBOARD.md](./MONITORING-DASHBOARD.md) | Historical PM2 / CloudWatch |
| [INCIDENT-RECOVERY.md](./INCIDENT-RECOVERY.md) | Historical EC2 incident steps |

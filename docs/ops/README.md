# NET360 Production Operations

Operational runbooks for the NET360 API (EC2 + PM2 + MongoDB Atlas).

| Document | Purpose |
|----------|---------|
| [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) | Pre/post deploy verification |
| [INCIDENT-RECOVERY.md](./INCIDENT-RECOVERY.md) | Outage response and rollback |
| [MONITORING-DASHBOARD.md](./MONITORING-DASHBOARD.md) | CloudWatch, PM2, health endpoints |

## Quick reference

```bash
# One-time EC2 setup
sudo bash scripts/setup-pm2-production.sh

# Deploy API (main branch)
bash scripts/deploy-api-production.sh main

# Verify routes
bash scripts/verify-post-deploy-routes.sh https://api.net360preparation.com

# Rollback
bash scripts/rollback-api-production.sh .deploy-rollback-YYYYMMDD-HHMMSS

# Health endpoints
curl -sS https://api.net360preparation.com/api/health | jq .
curl -sS https://api.net360preparation.com/api/health/ready | jq .
curl -sS https://api.net360preparation.com/api/version | jq .
```

## Architecture

| Component | Host | Process |
|-----------|------|---------|
| Frontend SPA | Vercel (`web-production`) | Static + `/api/*` rewrite |
| API | EC2 `api.net360preparation.com` | PM2 `net360-api` → `server/index.js:5000` |
| Reverse proxy | Nginx on EC2 | TLS + WebSocket to PM2 |
| Database | MongoDB Atlas | `MONGODB_URI` |
| Media | S3 `ap-south-1` | AWS SDK |
| Logs | PM2 files + CloudWatch | `/net360/production/api` |

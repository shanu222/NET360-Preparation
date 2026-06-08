# NET360 Deployment Verification Checklist

Use this checklist for every API deployment to `api.net360preparation.com`.

## Pre-deploy

- [ ] Changes merged to `main` and reviewed
- [ ] `npm run build` passes locally or in CI
- [ ] `node --check server/index.js` passes
- [ ] No secrets in commit (`.env`, `secrets/`, service account JSON)
- [ ] MongoDB migrations / schema changes documented (if any)
- [ ] Rollback commit recorded automatically by deploy script

## Deploy (EC2)

```bash
ssh api-server
cd /root/NET360-Preparation
bash scripts/deploy-api-production.sh main
```

The script will:

1. Save rollback tag (`.deploy-rollback-*`)
2. `git pull` target branch
3. Write `deploy/build-info.json` (commit, branch, timestamp)
4. Build + syntax check
5. `pm2 startOrReload ecosystem.config.cjs`
6. Run `scripts/verify-post-deploy-routes.sh`

## Post-deploy verification

### Automated (included in deploy script)

- [ ] `GET /api/health` → 200, `status: ok`, `mongo` block present
- [ ] `GET /api/health/ready` → 200 (503 acceptable briefly after restart if Mongo reconnecting)
- [ ] `GET /api/version` → commit matches expected `git rev-parse HEAD`
- [ ] `GET /api/subscriptions/plans` → 200
- [ ] Admin routes return 401 (not 404): `/api/admin/subscriptions/management/users`

### Manual smoke tests

- [ ] Admin login → `/admin` loads without 401 loop
- [ ] Admin → Users → search returns results
- [ ] Admin → Support chat → conversations load (200)
- [ ] Student login on web + Android (spot check)
- [ ] `pm2 list` → `net360-api` status **online**
- [ ] `pm2 logs net360-api --lines 30` → no crash loop

### Deployment drift check

```bash
LOCAL=$(git rev-parse HEAD)
REMOTE=$(curl -sS https://api.net360preparation.com/api/version | jq -r .commit)
[[ "$LOCAL" == "$REMOTE" ]] && echo OK || echo DRIFT
```

### Frontend (Vercel — separate deploy)

After API deploy, if frontend changed:

```bash
# From developer machine
bash scripts/net360-after-vercel-deploy.sh
```

- [ ] `www.net360preparation.com` loads
- [ ] Browser network tab: API calls go to `api.net360preparation.com`
- [ ] No CORS errors on admin or student flows

## Sign-off

| Field | Value |
|-------|-------|
| Deployer | |
| Date (UTC) | |
| Branch | |
| Commit | |
| Rollback tag | `.deploy-rollback-*` |
| Issues | |

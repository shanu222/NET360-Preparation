# NET360 Production Incident Recovery Plan

## Severity levels

| Level | Example | Response time |
|-------|---------|---------------|
| S1 | API down, all users affected | Immediate |
| S2 | Admin down, degraded auth, Mongo disconnected | < 30 min |
| S3 | Single feature broken, high error rate | < 4 hours |

## On-call first steps (any severity)

1. **Confirm scope**
   ```bash
   curl -sS https://api.net360preparation.com/api/health | jq .
   curl -sS https://api.net360preparation.com/api/health/ready | jq .
   curl -sS https://api.net360preparation.com/api/version | jq .
   ```

2. **Check PM2 on EC2**
   ```bash
   ssh api-server
   pm2 list
   pm2 logs net360-api --lines 100
   tail -n 100 /root/NET360-Preparation/logs/net360-api-error.log
   ```

3. **Check Nginx**
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   tail -n 50 /var/log/nginx/error.log
   ```

4. **Check MongoDB Atlas**
   - Atlas dashboard → cluster health, connections, alerts
   - Verify `MONGODB_URI` unchanged in `.env`
   - Health endpoint: `mongo.connected: false` → DB issue

## Common incidents

### API returns 502 / connection refused

**Cause:** PM2 process stopped, wrong port, duplicate Node process.

```bash
pm2 list
ss -lntp | grep 5000
pm2 restart net360-api --update-env
pm2 save
```

If duplicate listeners: `pm2 delete <stray-process>` then restart `net360-api`.

### PM2 crash loop (high restart count)

**Cause:** Uncaught exception, OOM, bad deploy.

```bash
pm2 logs net360-api --err --lines 200
# Rollback if started after deploy:
bash scripts/rollback-api-production.sh
```

Memory protection: PM2 `max_memory_restart: 750M` + Node `--max-old-space-size=768`.

### MongoDB disconnected

**Cause:** Atlas IP allowlist, credential rotation, network blip.

- Server continues running; background reconnect active (`[mongo]` logs)
- `/api/health` → 200 (liveness)
- `/api/health/ready` → 503 until connected

Fix Atlas access, then verify:
```bash
curl -sS http://127.0.0.1:5000/api/health/ready | jq .mongo
```

### Bad deploy / regression

```bash
cd /root/NET360-Preparation
ls -1t .deploy-rollback-*
bash scripts/rollback-api-production.sh .deploy-rollback-YYYYMMDD-HHMMSS
```

### Deployment drift (wrong commit live)

```bash
git rev-parse HEAD
curl -sS https://api.net360preparation.com/api/version | jq .
bash scripts/deploy-api-production.sh main
```

### Disk full (logs / backups)

```bash
df -h
du -sh /root/NET360-Preparation/logs /var/backups/net360
pm2 flush
find /var/backups/net360 -name '*.gz' -mtime +14 -delete
```

Log rotation: `pm2-logrotate` (max 20M, retain 14, compress).

## Rollback workflow

1. Identify last good commit: `cat .deploy-rollback-*`
2. `bash scripts/rollback-api-production.sh <tag-file>`
3. Verify: `bash scripts/verify-post-deploy-routes.sh https://api.net360preparation.com`
4. Notify stakeholders; create post-incident note

## Recovery validation

- [ ] `/api/health` → 200
- [ ] `/api/health/ready` → 200
- [ ] Admin login works
- [ ] Student login works
- [ ] `pm2 list` → online, restarts not climbing
- [ ] CloudWatch logs flowing (if configured)

## Escalation

| Resource | Contact / link |
|----------|----------------|
| MongoDB Atlas | Atlas support + cluster metrics |
| AWS EC2 | AWS Console → instance status checks |
| Domain / DNS | Registrar / Cloudflare |
| Vercel frontend | Vercel dashboard deployments |

## Post-incident

1. Document timeline, root cause, fix
2. Add monitoring alert if gap identified
3. Update this runbook if steps were missing

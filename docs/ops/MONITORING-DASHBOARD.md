# NET360 Monitoring Dashboard Setup

## Health endpoints

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /api/health` | Liveness + full status | 200 always if process up |
| `GET /api/health/ready` | Readiness (Mongo) | 200 when DB connected |
| `GET /api/version` | Deployed commit / drift | 200 + `commit` field |

### Example payloads

```bash
curl -sS https://api.net360preparation.com/api/health | jq '{status, uptimeSec, mongo, process, build}'
curl -sS https://api.net360preparation.com/api/version | jq '{commit, commitShort, branch, deployedAt}'
```

Key fields for alerting:

- `mongo.connected` — false → page on-call
- `process.memoryMb.heapUsed` — > 650 → warn
- `build.commit` — compare to expected deploy commit

## PM2 monitoring

### CLI

```bash
pm2 list
pm2 monit
pm2 logs net360-api
pm2 describe net360-api
```

### Automated health cron

Installed by `scripts/setup-pm2-production.sh`:

```
/etc/cron.d/net360-health  →  scripts/pm2-health-monitor.sh  (every 5 min)
```

Log: `logs/health-monitor.log`

Actions on failure:

- Restarts PM2 app if not `online`
- Logs Mongo disconnect, high heap, failed `/api/health`

## AWS CloudWatch

### Install (one-time)

```bash
sudo INSTALL_CLOUDWATCH=1 bash scripts/setup-pm2-production.sh
# or
sudo bash deploy/cloudwatch/install-cloudwatch-agent.sh
```

**IAM:** Attach `CloudWatchAgentServerPolicy` to EC2 instance profile.

### Log groups

| Log group | Source |
|-----------|--------|
| `/net360/production/api` | PM2 out + error logs |
| `/net360/production/nginx` | Nginx access + error |

Config: `deploy/cloudwatch/amazon-cloudwatch-agent.json`

### Metrics namespace

`NET360/Production` — CPU, memory, disk from CloudWatch Agent.

### Recommended CloudWatch alarms

Create in AWS Console → CloudWatch → Alarms:

| Alarm | Metric / query | Threshold |
|-------|----------------|-----------|
| API health failed | Custom canary hitting `/api/health` | HTTP != 200 |
| High CPU | `NET360/Production` CPU > 80% | 5 min |
| Low disk | `disk_used_percent` | > 85% |
| Mongo not ready | External synthetic on `/api/health/ready` | 503 > 3 checks |

### CloudWatch Logs Insights queries

**API errors (last hour):**

```
fields @timestamp, @message
| filter @message like /ERROR|CRITICAL|Uncaught/
| sort @timestamp desc
| limit 50
```

**Mongo reconnect spam:**

```
fields @timestamp, @message
| filter @message like /\[mongo\]/
| sort @timestamp desc
| limit 100
```

## Uptime monitoring (external)

Configure any uptime provider (UptimeRobot, Better Stack, Route 53 health checks):

1. `https://api.net360preparation.com/api/health` — interval 1 min
2. `https://api.net360preparation.com/api/health/ready` — interval 5 min
3. Keyword check: `"status":"ok"` in health body

## Admin panel infra view

Admin → Configurations shows host-level infra snapshot (Mongo, Firebase, JWT, crypto).

Live OpenAI probe: `GET /api/admin/openai-health` (auth required).

## Daily backups

Cron (from setup script):

```
15 2 * * *  scripts/mongodb-backup-daily.sh
```

Backups: `/var/backups/net360/net360-mongo-*.gz`  
Retention: 14 days (configurable via `BACKUP_RETENTION_DAYS`)  
Optional S3: set `S3_BACKUP_BUCKET` + AWS CLI on host.

## Dashboard layout (recommended)

```
┌─────────────────────────────────────────────────────────┐
│ NET360 Production                                        │
├──────────────┬──────────────┬───────────────────────────┤
│ Uptime       │ /api/health  │ /api/health/ready         │
│ (external)   │ 200 OK       │ Mongo connected           │
├──────────────┴──────────────┴───────────────────────────┤
│ Deployed commit: abc1234  │  Branch: main               │
│ PM2 restarts (24h)        │  Heap MB                    │
├─────────────────────────────────────────────────────────┤
│ CloudWatch Logs: /net360/production/api (errors)        │
│ CloudWatch Metrics: CPU, mem, disk                      │
└─────────────────────────────────────────────────────────┘
```

## Memory leak protection

| Layer | Setting |
|-------|---------|
| PM2 | `max_memory_restart: 750M` |
| Node | `--max-old-space-size=768` |
| Monitor | `pm2-health-monitor.sh` warns heap > 700MB |
| Process | Graceful SIGTERM shutdown closes HTTP + Mongo |

If repeated OOM restarts: capture `pm2 logs`, roll back deploy, inspect recent code changes.

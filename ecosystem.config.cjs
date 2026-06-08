/**
 * PM2 process file for NET360 API (EC2).
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * One-time host setup: bash scripts/setup-pm2-production.sh
 */
const path = require('node:path');

const logDir = process.env.NET360_LOG_DIR || path.join(__dirname, 'logs');

module.exports = {
  apps: [
    {
      name: 'net360-api',
      script: 'server/index.js',
      cwd: __dirname,
      instances: process.env.PM2_INSTANCES ? Number(process.env.PM2_INSTANCES) : 1,
      exec_mode: process.env.PM2_CLUSTER === '1' ? 'cluster' : 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 15,
      min_uptime: '10s',
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: process.env.PM2_MAX_MEMORY || '750M',
      node_args: process.env.NODE_ARGS || '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
      },
      merge_logs: true,
      time: true,
      wait_ready: true,
      listen_timeout: 20_000,
      kill_timeout: 10_000,
      error_file: path.join(logDir, 'net360-api-error.log'),
      out_file: path.join(logDir, 'net360-api-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};

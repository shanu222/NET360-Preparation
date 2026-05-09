/**
 * PM2 process file for NET360 API (EC2). Tune instances only when Redis + Socket.IO adapter are enabled.
 * Usage: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'net360-api',
      script: 'server/index.js',
      cwd: __dirname,
      instances: process.env.PM2_INSTANCES ? Number(process.env.PM2_INSTANCES) : 1,
      exec_mode: process.env.PM2_CLUSTER === '1' ? 'cluster' : 'fork',
      max_memory_restart: '750M',
      node_args: '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
      },
      merge_logs: true,
      time: true,
      wait_ready: false,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};

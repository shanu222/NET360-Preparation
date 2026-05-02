/**
 * PM2 process file — run from repository root:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Prereqs: `npm ci` (or `npm install`), `npm run build`, server `.env` present for API.
 */
module.exports = {
  apps: [
    {
      name: 'net360-backend',
      cwd: __dirname,
      script: 'server/index.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'frontend',
      cwd: __dirname,
      script: 'node_modules/serve/build/main.js',
      args: ['-s', 'dist', '-l', '3000'],
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
    },
  ],
};

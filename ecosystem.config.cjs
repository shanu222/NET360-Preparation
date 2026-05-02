/**
 * PM2 — from repo root: pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: __dirname,
      script: 'server/index.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        CORS_ALLOWED_ORIGINS:
          'https://net-360-preparation.vercel.app,http://localhost:3000,http://localhost:5173',
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
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

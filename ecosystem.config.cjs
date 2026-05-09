/**
 * PM2 — from repo root: pm2 start ecosystem.config.cjs && pm2 save
 *
 * Redis: export REDIS_* (or REDIS_URL) in the shell before `pm2 start`, or use `pm2 start`
 * with `--update-env` after loading a server-only env file. Do not commit secrets.
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
        REDIS_URL: process.env.REDIS_URL || '',
        REDIS_HOST: process.env.REDIS_HOST || '',
        REDIS_PORT: process.env.REDIS_PORT || '',
        REDIS_USERNAME: process.env.REDIS_USERNAME || '',
        REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
        REDIS_CACHE_PREFIX: process.env.REDIS_CACHE_PREFIX || '',
        COMMUNITY_LEADERBOARD_CACHE_TTL_SEC: process.env.COMMUNITY_LEADERBOARD_CACHE_TTL_SEC || '',
        QUIZ_LEADERBOARD_CACHE_TTL_SEC: process.env.QUIZ_LEADERBOARD_CACHE_TTL_SEC || '',
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

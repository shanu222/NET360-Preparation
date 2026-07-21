/**
 * Build entry used by `npm run build`.
 * - Vercel / local: run Vite production build + media strip helper.
 * - Railway: Express API only — never invoke Vite (vite is a devDependency and
 *   is omitted from production installs → "vite: not found").
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function isRailwayRuntime() {
  return Boolean(
    String(process.env.RAILWAY_ENVIRONMENT || '').trim()
    || String(process.env.RAILWAY_ENVIRONMENT_ID || '').trim()
    || String(process.env.RAILWAY_SERVICE_ID || '').trim()
    || String(process.env.RAILWAY_PROJECT_ID || '').trim()
    || String(process.env.RAILWAY_STATIC_URL || '').trim(),
  );
}

if (isRailwayRuntime()) {
  console.log('[build] Railway detected — skipping vite (API-only; frontend is on Vercel).');
  process.exit(0);
}

const vite = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
if (vite.status !== 0) {
  process.exit(vite.status ?? 1);
}

const strip = spawnSync(process.execPath, ['scripts/strip-bundled-cdn-media-from-dist.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(strip.status ?? 0);

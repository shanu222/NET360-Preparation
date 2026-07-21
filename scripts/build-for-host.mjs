/**
 * Build entry used by `npm run build`.
 *
 * - Vercel / local (vite installed): full Vite production build.
 * - Railway / production API image (vite omitted from install): exit 0.
 *
 * Root cause of Railway failure: default `npm run build` ran `vite build` while
 * `vite` is only a devDependency and is not present under production installs.
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const require = createRequire(import.meta.url);

function isRailwayBuild() {
  return Boolean(
    String(process.env.RAILWAY_ENVIRONMENT || '').trim()
    || String(process.env.RAILWAY_ENVIRONMENT_ID || '').trim()
    || String(process.env.RAILWAY_SERVICE_ID || '').trim()
    || String(process.env.RAILWAY_PROJECT_ID || '').trim()
    || String(process.env.RAILWAY_STATIC_URL || '').trim()
    || String(process.env.RAILWAY || '').trim()
    || String(process.env.SKIP_VITE_BUILD || '').toLowerCase() === 'true'
    || String(process.env.SKIP_VITE_BUILD || '').trim() === '1',
  );
}

function isViteInstalled() {
  try {
    require.resolve('vite/package.json');
    return true;
  } catch {
    return false;
  }
}

// Prefer Vercel/local when Vite is available; skip on Railway or when vite was omitted.
if (isRailwayBuild() || !isViteInstalled()) {
  console.log(
    '[build] Skipping vite — API-only deploy (Railway / production install without vite). Frontend builds on Vercel.',
  );
  process.exit(0);
}

const vite = spawnSync('npx', ['--no-install', 'vite', 'build'], {
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

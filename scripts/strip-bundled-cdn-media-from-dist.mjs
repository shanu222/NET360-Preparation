/**
 * After `vite build`, remove large marketing/media files from `dist/` so deploys and Capacitor
 * bundles stay small. Most marketing media is served from S3 (`getMediaUrl` / `VITE_S3_BASE_URL`).
 * `images/app-promo.png` stays in dist for the login hero (same-origin, no S3 dependency).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.warn('[strip-bundled-cdn-media] dist/ missing — skip (e.g. analyze-only build).');
  process.exit(0);
}

/** Paths under dist/ to remove (same keys as uploaded to S3). */
const paths = [
  path.join(dist, 'schools'),
  path.join(dist, 'assets', 'videos', 'net360-guide.mp4'),
  path.join(dist, 'images', 'login-banner.png'),
];

for (const p of paths) {
  try {
    if (!fs.existsSync(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log('[strip-bundled-cdn-media] removed', path.relative(root, p) + '/');
    } else {
      fs.rmSync(p, { force: true });
      console.log('[strip-bundled-cdn-media] removed', path.relative(root, p));
    }
  } catch (err) {
    console.warn('[strip-bundled-cdn-media]', p, err instanceof Error ? err.message : err);
  }
}

console.log('[strip-bundled-cdn-media] done. Ensure S3 has schools/, images/, videos/ and VITE_S3_BASE_URL is set (login still ships images/app-promo.png in dist).');

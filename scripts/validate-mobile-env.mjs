import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const workspaceRoot = process.cwd();
const androidEnvPath = path.join(workspaceRoot, '.env.android');
const defaultEnvPath = path.join(workspaceRoot, '.env');

dotenv.config({ path: defaultEnvPath, override: false });
dotenv.config({ path: androidEnvPath, override: true });

const apiBaseUrl = String(process.env.VITE_API_BASE_URL || '').trim();
const mobileApiBaseUrl = String(process.env.VITE_MOBILE_API_BASE_URL || '').trim();
const effectiveBaseUrl = mobileApiBaseUrl || apiBaseUrl;

if (!effectiveBaseUrl) {
  console.error(
    '[mobile:build] Missing API base URL. Set VITE_API_BASE_URL or VITE_MOBILE_API_BASE_URL in .env.android before building Android.',
  );
  process.exit(1);
}

if (!/^https?:\/\//i.test(effectiveBaseUrl)) {
  console.error('[mobile:build] API base URL must start with http:// or https://. Received:', effectiveBaseUrl);
  process.exit(1);
}

if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(effectiveBaseUrl)) {
  console.error(
    '[mobile:build] API base URL points to localhost, which will fail on real Android devices. Use your live backend URL.',
  );
  process.exit(1);
}

if (/^http:\/\//i.test(effectiveBaseUrl)) {
  console.warn('[mobile:build] Warning: non-HTTPS API URL detected. Prefer HTTPS for Android production builds.');
}

console.log('[mobile:build] Using backend URL:', effectiveBaseUrl);

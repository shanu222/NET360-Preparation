import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const workspaceRoot = process.cwd();
const androidEnvPath = path.join(workspaceRoot, '.env.android');
const defaultEnvPath = path.join(workspaceRoot, '.env');

dotenv.config({ path: defaultEnvPath, override: false });
dotenv.config({ path: androidEnvPath, override: true });

const apiBaseUrl = String(process.env.VITE_API_URL || process.env.VITE_API_BASE_URL || '').trim();

if (!apiBaseUrl) {
  console.error(
    '[mobile:build] Missing API base URL. Set VITE_API_URL (or VITE_API_BASE_URL) in .env.android before building Android.',
  );
  process.exit(1);
}

if (!/^https?:\/\//i.test(apiBaseUrl)) {
  console.error('[mobile:build] API base URL must start with http:// or https://. Received:', apiBaseUrl);
  process.exit(1);
}

if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(apiBaseUrl)) {
  console.error(
    '[mobile:build] API base URL points to localhost, which will fail on real Android devices. Use your live backend URL.',
  );
  process.exit(1);
}

if (/^http:\/\//i.test(apiBaseUrl)) {
  console.warn('[mobile:build] Warning: non-HTTPS API URL detected. Prefer HTTPS for Android production builds.');
}

const mediaBase = String(process.env.VITE_S3_BASE_URL || process.env.VITE_PUBLIC_MEDIA_BASE_URL || '').trim();
if (!mediaBase) {
  console.warn(
    '[mobile:build] VITE_S3_BASE_URL is unset. Schools/profile/guide media are stripped from the app bundle — set it in .env.android.',
  );
} else {
  console.log('[mobile:build] Media base URL:', mediaBase.replace(/\/+$/, ''));
}

console.log('[mobile:build] Using backend URL:', apiBaseUrl);

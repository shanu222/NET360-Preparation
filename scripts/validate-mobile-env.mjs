import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { buildAndroidViteEnv } from './merge-android-vite-env.mjs';

const workspaceRoot = process.cwd();

const merged = buildAndroidViteEnv(workspaceRoot);
for (const [key, value] of Object.entries(merged)) {
  if (value !== undefined && value !== null && value !== '') {
    process.env[key] = String(value);
  }
}

const apiBaseUrl = String(process.env.VITE_API_URL || process.env.VITE_API_BASE_URL || '').trim();

if (!apiBaseUrl) {
  console.error(
    '[mobile:build] Missing API base URL. Set VITE_API_URL (or VITE_API_BASE_URL) in .env.production or .env.android before building Android.',
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
  console.error(
    '[mobile:build] Missing VITE_S3_BASE_URL (or VITE_PUBLIC_MEDIA_BASE_URL). ' +
      'Android builds strip bundled media and require a CDN/S3 media base URL.',
  );
  process.exit(1);
} else {
  console.log('[mobile:build] Media base URL:', mediaBase.replace(/\/+$/, ''));
}

console.log('[mobile:build] Using backend URL:', apiBaseUrl);

const firebaseApiKey = String(process.env.VITE_FIREBASE_API_KEY || '').trim();
const firebaseAuthDomain = String(process.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
const firebaseProjectId = String(process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const firebaseAppId = String(process.env.VITE_FIREBASE_APP_ID || '').trim();

const missingFirebaseVars = [
  !firebaseApiKey && 'VITE_FIREBASE_API_KEY',
  !firebaseAuthDomain && 'VITE_FIREBASE_AUTH_DOMAIN',
  !firebaseProjectId && 'VITE_FIREBASE_PROJECT_ID',
  !firebaseAppId && 'VITE_FIREBASE_APP_ID',
].filter(Boolean);

if (missingFirebaseVars.length) {
  console.error(
    `[mobile:build] Missing Firebase Android runtime env values: ${missingFirebaseVars.join(', ')}. ` +
      'Set them in .env.android (or .env.production), or ensure android/app/google-services.json is valid so values can be inferred.',
  );
  process.exit(1);
}

const googleServicesPath = path.join(workspaceRoot, 'android', 'app', 'google-services.json');
if (!fs.existsSync(googleServicesPath)) {
  console.error(
    `[mobile:build] Missing ${googleServicesPath}. ` +
      'Add Firebase Android config for package com.net360.preparation before Android release builds.',
  );
  process.exit(1);
}

try {
  const parsed = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
  const packageNames = new Set(
    (parsed?.client || [])
      .map((c) => c?.client_info?.android_client_info?.package_name)
      .filter(Boolean),
  );
  if (!packageNames.has('com.net360.preparation')) {
    console.error(
      '[mobile:build] google-services.json does not include package com.net360.preparation. ' +
        `Found: ${Array.from(packageNames).join(', ') || '(none)'}`,
    );
    process.exit(1);
  }
} catch (error) {
  console.error('[mobile:build] Could not parse google-services.json:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

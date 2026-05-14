/**
 * Resolves Vite env vars for Capacitor Android builds.
 * Order: `.env.production` → `.env.android` → `.env.android.local` (later wins).
 * Missing `VITE_FIREBASE_*` are filled from `android/app/google-services.json` when possible
 * so `npm run mobile:build` works without a hand-maintained duplicate `.env.android`.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return dotenv.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

export function inferFirebaseFromGoogleServices(workspaceRoot, env) {
  const out = { ...env };
  const hasCore = Boolean(
    String(out.VITE_FIREBASE_API_KEY || '').trim()
      && String(out.VITE_FIREBASE_AUTH_DOMAIN || '').trim()
      && String(out.VITE_FIREBASE_PROJECT_ID || '').trim()
      && String(out.VITE_FIREBASE_APP_ID || '').trim(),
  );
  if (hasCore) {
    return out;
  }

  const gsPath = path.join(workspaceRoot, 'android', 'app', 'google-services.json');
  if (!fs.existsSync(gsPath)) return out;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
  } catch {
    return out;
  }

  const pi = parsed.project_info || {};
  const client = (parsed.client || []).find(
    (c) => String(c?.client_info?.android_client_info?.package_name || '') === 'com.net360.preparation',
  ) || parsed.client?.[0];

  const apiKey = String(client?.api_key?.[0]?.current_key || '').trim();
  const appId = String(client?.client_info?.mobilesdk_app_id || '').trim();
  const projectId = String(pi.project_id || '').trim();

  if (!String(out.VITE_FIREBASE_API_KEY || '').trim() && apiKey) out.VITE_FIREBASE_API_KEY = apiKey;
  if (!String(out.VITE_FIREBASE_PROJECT_ID || '').trim() && projectId) out.VITE_FIREBASE_PROJECT_ID = projectId;
  if (!String(out.VITE_FIREBASE_AUTH_DOMAIN || '').trim() && projectId) {
    out.VITE_FIREBASE_AUTH_DOMAIN = `${projectId}.firebaseapp.com`;
  }
  if (!String(out.VITE_FIREBASE_STORAGE_BUCKET || '').trim() && pi.storage_bucket) {
    out.VITE_FIREBASE_STORAGE_BUCKET = String(pi.storage_bucket).trim();
  }
  if (!String(out.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() && pi.project_number != null) {
    out.VITE_FIREBASE_MESSAGING_SENDER_ID = String(pi.project_number).trim();
  }
  if (!String(out.VITE_FIREBASE_APP_ID || '').trim() && appId) {
    out.VITE_FIREBASE_APP_ID = appId;
  }

  return out;
}

export function buildAndroidViteEnv(workspaceRoot) {
  const productionPath = path.join(workspaceRoot, '.env.production');
  const androidPath = path.join(workspaceRoot, '.env.android');
  const androidLocalPath = path.join(workspaceRoot, '.env.android.local');

  const merged = {
    ...readEnvFile(productionPath),
    ...readEnvFile(androidPath),
    ...readEnvFile(androidLocalPath),
  };

  return inferFirebaseFromGoogleServices(workspaceRoot, merged);
}

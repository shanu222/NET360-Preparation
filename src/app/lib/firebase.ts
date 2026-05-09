import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

const app = isFirebaseConfigured()
  ? (getApps()[0] || initializeApp(firebaseConfig))
  : null;

export const firebaseAuth = app ? getAuth(app) : null;

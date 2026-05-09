import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

const app: FirebaseApp | null = isFirebaseConfigured()
  ? (getApps()[0] || initializeApp(firebaseConfig))
  : null;

/** Prefer explicit local persistence so refresh / multi-tab behave consistently after browser restarts. */
export const firebaseAuth = app
  ? (() => {
      try {
        return initializeAuth(app, { persistence: browserLocalPersistence });
      } catch {
        return getAuth(app);
      }
    })()
  : null;

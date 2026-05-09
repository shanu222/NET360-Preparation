import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';

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

/**
 * `initializeAuth` must include `browserPopupRedirectResolver` when using popup/redirect providers
 * (e.g. Google). Omitting it makes `signInWithPopup` throw `auth/argument-error` in the modular SDK.
 */
export const firebaseAuth = app
  ? (() => {
      try {
        return initializeAuth(app, {
          persistence: browserLocalPersistence,
          popupRedirectResolver: browserPopupRedirectResolver,
        });
      } catch {
        return getAuth(app);
      }
    })()
  : null;

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  type Auth,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { logNativeEvent } from './nativeDiagnostics';

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
let firebaseAuthSingleton: Auth | null = null;
let firebaseAuthInitPromise: Promise<Auth | null> | null = null;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.floor(ms)));
  });
}

function shouldUseNativeBootstrap(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function storageReady(): boolean {
  try {
    const key = '__net360_firebase_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function getAuthPersistenceChain() {
  return shouldUseNativeBootstrap()
    ? [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
    : [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence];
}

async function initializeFirebaseAuthWithRetry(): Promise<Auth | null> {
  if (!app) return null;
  if (firebaseAuthSingleton) return firebaseAuthSingleton;
  if (firebaseAuthInitPromise) return firebaseAuthInitPromise;

  firebaseAuthInitPromise = (async () => {
    const attempts = shouldUseNativeBootstrap() ? 4 : 2;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (shouldUseNativeBootstrap() && !storageReady()) {
          logNativeEvent('auth', 'firebase-storage-not-ready', { attempt }, 'warn');
          await delay(220 * attempt);
        }
        firebaseAuthSingleton = initializeAuth(app, {
          persistence: getAuthPersistenceChain(),
          popupRedirectResolver: browserPopupRedirectResolver,
        });
        logNativeEvent('auth', 'firebase-init-success', { attempt, native: shouldUseNativeBootstrap() });
        return firebaseAuthSingleton;
      } catch (error) {
        try {
          firebaseAuthSingleton = getAuth(app);
          logNativeEvent('auth', 'firebase-getauth-fallback', { attempt, native: shouldUseNativeBootstrap() }, 'warn');
          return firebaseAuthSingleton;
        } catch {
          logNativeEvent('auth', 'firebase-init-retry', {
            attempt,
            native: shouldUseNativeBootstrap(),
            message: (error as Error)?.message || String(error),
          }, 'warn');
          if (attempt < attempts) {
            await delay(300 * (2 ** (attempt - 1)));
          }
        }
      }
    }

    logNativeEvent('auth', 'firebase-init-failed', { native: shouldUseNativeBootstrap() }, 'error');
    return null;
  })();

  try {
    return await firebaseAuthInitPromise;
  } finally {
    firebaseAuthInitPromise = null;
  }
}

export async function ensureFirebaseAuthReady(): Promise<Auth | null> {
  return initializeFirebaseAuthWithRetry();
}

export const firebaseAuth = app ? (() => {
  try {
    firebaseAuthSingleton = initializeAuth(app, {
      persistence: getAuthPersistenceChain(),
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    return firebaseAuthSingleton;
  } catch {
    try {
      firebaseAuthSingleton = getAuth(app);
      return firebaseAuthSingleton;
    } catch {
      return null;
    }
  }
})() : null;

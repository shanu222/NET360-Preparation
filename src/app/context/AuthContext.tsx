import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  deleteUser,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  COOKIE_SESSION_API_MARKER,
  clearPersistedStudentTokens,
  hasStoredAuthCredentials,
  isCookieSessionApiMarker,
  persistCookieSessionMode,
  persistStudentTokens,
  readSessionIdFromAccessToken,
  shouldPersistAuthTokens,
} from '../lib/authSession';
import { ensureFirebaseAuthReady, firebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { showNeutralToast, showSuccessToast, showWarningToast } from '../lib/userToast';
import { updateAuthDebug } from '../lib/authDebugState';
import { isNativeRuntime as isNativeRuntimePlatform, logNativeEvent } from '../lib/nativeDiagnostics';
import { signInWithGoogleAndroidNative } from '../lib/nativeGoogleAuth';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: 'student' | 'admin';
  /** Present on `/api/auth/me` for students; used for session diagnostics only. */
  activeSessionId?: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, opts?: { forceLogoutOtherDevice?: boolean; forceLogin?: boolean }) => Promise<void>;
  loginWithGoogle: (opts?: { forceLogoutOtherDevice?: boolean; forceLogin?: boolean }) => Promise<void>;
  registerWithToken: (params: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  sendRecoveryEmail: (email: string) => Promise<void>;
  deleteAccount: (params: { password: string; confirmationText: string }) => Promise<{ message: string }>;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'net360-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'net360-auth-refresh-token';
const DEVICE_STORAGE_KEY = 'net360-device-id';
const DEVICE_COOKIE_KEY = 'net360_device_id';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readCookieValue(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function writeCookieValue(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365 * 5}; SameSite=Lax`;
}

function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // fallback to cookie
  }
  const existingCookie = readCookieValue(DEVICE_COOKIE_KEY);
  if (existingCookie) {
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, existingCookie);
    } catch {
      // Ignore storage sync failures.
    }
    return existingCookie;
  }
  const created = `device-${Date.now()}-${Math.round(Math.random() * 1000000)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, created);
  } catch {
    // Ignore storage failure; cookie persists as fallback.
  }
  writeCookieValue(DEVICE_COOKIE_KEY, created);
  return created;
}

function redirectToLoginScreen() {
  if (typeof window === 'undefined') return;
  const target = String(window.location.pathname || '').toLowerCase().startsWith('/admin')
    ? '/admin'
    : '/?tab=profile';
  if (window.location.pathname + window.location.search === target) return;
  window.location.assign(target);
}

function clearSessionStorageSafe() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.clear();
  } catch {
    // Ignore unavailable storage.
  }
}

function clearLocalStorageAuthStateSafe() {
  if (typeof window === 'undefined') return;
  const keysToDelete = [
    'net360-profile-photo-data-url',
    'net360-auth-debug',
  ];
  for (const key of keysToDelete) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore unavailable storage.
    }
  }
}

let authSessionLoadGeneration = 0;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.floor(ms)));
  });
}

function isLikelyTransientAuthFailure(error: unknown): boolean {
  const err = error as Error & { code?: string; status?: number };
  const message = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  const status = Number(err?.status);
  return (
    code === 'request_timeout'
    || code === 'auth/network-request-failed'
    || message.includes('network')
    || message.includes('timed out')
    || message.includes('failed to fetch')
    || message.includes('request timeout')
    || (Number.isFinite(status) && [408, 425, 429, 500, 502, 503, 504].includes(status))
  );
}

function decodeJwtClaims(token: string): { aud?: string; iss?: string; sub?: string } {
  try {
    const payloadPart = String(token || '').split('.')[1] || '';
    if (!payloadPart) return {};
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const parsed = JSON.parse(atob(normalized + pad)) as { aud?: string; iss?: string; sub?: string };
    return {
      aud: String(parsed.aud || ''),
      iss: String(parsed.iss || ''),
      sub: String(parsed.sub || ''),
    };
  } catch {
    return {};
  }
}

function extractAuthErrorCode(error: unknown): string {
  const typed = error as Error & { code?: string; payload?: { code?: string } };
  return String(typed?.code || typed?.payload?.code || '').trim();
}

async function signInWithEmailPasswordRest(email: string, password: string): Promise<{ idToken: string }> {
  const apiKey = String((import.meta as ImportMeta & { env?: { VITE_FIREBASE_API_KEY?: string } }).env?.VITE_FIREBASE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Firebase API key missing for native login fallback.');
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !payload?.idToken) {
    const code = String(payload?.error?.message || '').trim();
    if (code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('INVALID_PASSWORD') || code.includes('EMAIL_NOT_FOUND')) {
      throw new Error('Incorrect email or password.');
    }
    throw new Error(code ? `Firebase REST login failed: ${code}` : `Firebase REST login failed (${response.status}).`);
  }
  return { idToken: String(payload.idToken) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    shouldPersistAuthTokens() ? localStorage.getItem(TOKEN_STORAGE_KEY) : null,
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    shouldPersistAuthTokens() ? localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) : null,
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const isNativeRuntime = Capacitor.isNativePlatform() && isNativeRuntimePlatform();
  const isAndroidNative = isNativeRuntime && Capacitor.getPlatform() === 'android';
  const runSessionRestoreRef = useRef<(reason?: string) => Promise<void>>(async () => undefined);
  const authBootstrapInFlightRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!isNativeRuntime) return;
    updateAuthDebug({ sessionDeviceId: deviceId });
  }, [deviceId, isNativeRuntime]);

  const detectNativeWebViewCapabilities = useCallback(() => {
    return {
      online: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
      hasLocalStorage: (() => {
        try {
          const key = '__net360_local_storage_probe__';
          localStorage.setItem(key, '1');
          localStorage.removeItem(key);
          return true;
        } catch {
          return false;
        }
      })(),
      hasSessionStorage: (() => {
        try {
          const key = '__net360_session_storage_probe__';
          sessionStorage.setItem(key, '1');
          sessionStorage.removeItem(key);
          return true;
        } catch {
          return false;
        }
      })(),
      platform: (() => {
        try {
          return Capacitor.getPlatform();
        } catch {
          return 'unknown';
        }
      })(),
    };
  }, []);

  const waitForCapacitorReady = useCallback(async () => {
    if (!isNativeRuntime) return;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const platform = Capacitor.getPlatform();
        if (platform && platform !== 'web') return;
      } catch {
        // keep retrying
      }
      await delay(150 * (attempt + 1));
    }
  }, [isNativeRuntime]);

  const waitForNetworkReady = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (navigator.onLine) return;
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('online', onOnline);
        resolve();
      }, 6_000);
      const onOnline = () => {
        window.clearTimeout(timeout);
        window.removeEventListener('online', onOnline);
        resolve();
      };
      window.addEventListener('online', onOnline, { once: true });
    });
  }, []);

  const waitForStorageReady = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const key = '__net360_auth_bootstrap_probe__';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        localStorage.setItem(key, '1');
        localStorage.removeItem(key);
        return;
      } catch {
        await delay(220 * (attempt + 1));
      }
    }
  }, []);

  const ensureNativeAuthBootstrap = useCallback(async (reason: string): Promise<boolean> => {
    if (!isNativeRuntime) {
      return Boolean(firebaseAuth || (await ensureFirebaseAuthReady()));
    }
    if (authBootstrapInFlightRef.current) {
      return authBootstrapInFlightRef.current;
    }

    authBootstrapInFlightRef.current = (async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          await waitForCapacitorReady();
          await waitForNetworkReady();
          await waitForStorageReady();
          const auth = await ensureFirebaseAuthReady();
          const ok = Boolean(auth);
          updateAuthDebug({ firebaseInitialized: ok });
          logNativeEvent('auth', 'native-bootstrap', { reason, attempt, ok, ...detectNativeWebViewCapabilities() });
          if (ok) return true;
        } catch (error) {
          logNativeEvent('auth', 'native-bootstrap-error', {
            reason,
            attempt,
            message: (error as Error)?.message || String(error),
            ...detectNativeWebViewCapabilities(),
          }, 'warn');
        }
        if (attempt < 4) {
          await delay(260 * (2 ** (attempt - 1)));
        }
      }
      return false;
    })();

    try {
      return await authBootstrapInFlightRef.current;
    } finally {
      authBootstrapInFlightRef.current = null;
    }
  }, [detectNativeWebViewCapabilities, isNativeRuntime, waitForCapacitorReady, waitForNetworkReady, waitForStorageReady]);

  const applyAuthPayload = useCallback((payload: { token?: string; refreshToken?: string; user: AuthUser }) => {
    setUser(payload.user);
    if (payload.token && shouldPersistAuthTokens()) {
      setToken(payload.token);
      setRefreshToken(payload.refreshToken ?? null);
      persistStudentTokens(payload.token, payload.refreshToken ?? null);
    } else {
      setToken(COOKIE_SESSION_API_MARKER);
      setRefreshToken(null);
      persistCookieSessionMode();
    }
  }, []);

  const finalizeNativeAuthTransport = useCallback(async (
    payload: { token?: string; refreshToken?: string; user: AuthUser },
    reason: 'login' | 'register' | 'social-login',
  ) => {
    if (!isNativeRuntime) return payload;
    if (payload?.token && String(payload.token || '').trim()) {
      return payload;
    }
    logNativeEvent('auth', 'native-transport-cookie-only', { reason }, 'warn');
    try {
      const refreshed = await apiRequest<{ token?: string; refreshToken?: string; user?: AuthUser }>(
        '/api/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({}),
          retryCount: 2,
          retryDelayMs: 900,
          timeoutMs: 50_000,
        },
      );
      if (refreshed?.token) {
        logNativeEvent('auth', 'native-transport-refresh-token-success', { reason });
        return {
          token: refreshed.token,
          refreshToken: refreshed.refreshToken ?? null,
          user: refreshed.user || payload.user,
        };
      }
    } catch (error) {
      logNativeEvent('auth', 'native-transport-refresh-token-failed', {
        reason,
        message: (error as Error)?.message || String(error),
      }, 'warn');
    }
    return payload;
  }, [isNativeRuntime]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async (reason = 'mount') => {
      if (typeof window === 'undefined') return;

      const loadId = ++authSessionLoadGeneration;
      setLoading(true);

      if (!shouldPersistAuthTokens()) {
        if (!cancelled && loadId === authSessionLoadGeneration) setLoading(false);
        return;
      }

      if (!hasStoredAuthCredentials()) {
        logNativeEvent('auth', 'restore-skipped-no-credentials');
        if (!cancelled && loadId === authSessionLoadGeneration) setLoading(false);
        return;
      }

      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      const bearer = storedToken && !isCookieSessionApiMarker(storedToken) ? storedToken : undefined;
      const rt = storedRefresh;

      try {
        try {
          const me = await apiRequest<{ user: AuthUser }>(
            '/api/auth/me',
            { retryCount: isNativeRuntime ? 2 : 1, retryDelayMs: 900, timeoutMs: 45_000 },
            bearer,
          );
          if (cancelled || loadId !== authSessionLoadGeneration) return;
          logNativeEvent('auth', 'restore-from-me-success', { hasBearer: Boolean(bearer) });
          updateAuthDebug({
            activeSessionStatus: 'active',
            refreshStatus: 'ok',
          });
          setUser(me.user);
          if (!bearer) {
            setToken(COOKIE_SESSION_API_MARKER);
            persistCookieSessionMode();
          } else {
            setToken(storedToken);
          }
          return;
        } catch {
          /* /me failed — try refresh only when a refresh token exists, else cookie-only refresh if marked */
        }

        if (cancelled || loadId !== authSessionLoadGeneration) return;

        if (rt) {
          try {
            const refreshed = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
              '/api/auth/refresh',
              { method: 'POST', body: JSON.stringify({ refreshToken: rt }), retryCount: 2, retryDelayMs: 900, timeoutMs: 50_000 },
            );
            if (cancelled || loadId !== authSessionLoadGeneration) return;
            logNativeEvent('auth', 'restore-from-refresh-success');
            updateAuthDebug({
              refreshStatus: 'ok',
              activeSessionStatus: 'active',
            });
            setUser(refreshed.user);
            if (refreshed.token && shouldPersistAuthTokens()) {
              setToken(refreshed.token);
              setRefreshToken(refreshed.refreshToken ?? null);
              persistStudentTokens(refreshed.token, refreshed.refreshToken ?? null);
            } else {
              setToken(COOKIE_SESSION_API_MARKER);
              setRefreshToken(null);
              persistCookieSessionMode();
            }
            return;
          } catch {
            /* fall through */
          }
        }

        if (storedToken === COOKIE_SESSION_API_MARKER) {
          try {
            const refreshed = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
              '/api/auth/refresh',
              { method: 'POST', body: JSON.stringify({}), retryCount: 2, retryDelayMs: 900, timeoutMs: 50_000 },
            );
            if (cancelled || loadId !== authSessionLoadGeneration) return;
            logNativeEvent('auth', 'restore-from-cookie-refresh-success');
            updateAuthDebug({
              refreshStatus: 'ok',
              activeSessionStatus: 'active',
            });
            setUser(refreshed.user);
            if (refreshed.token && shouldPersistAuthTokens()) {
              setToken(refreshed.token);
              setRefreshToken(refreshed.refreshToken ?? null);
              persistStudentTokens(refreshed.token, refreshed.refreshToken ?? null);
            } else {
              setToken(COOKIE_SESSION_API_MARKER);
              setRefreshToken(null);
              persistCookieSessionMode();
            }
            return;
          } catch {
            /* logout below */
          }
        }

        if (cancelled || loadId !== authSessionLoadGeneration) return;
        setToken(null);
        setRefreshToken(null);
        setUser(null);
        logNativeEvent('auth', 'restore-failed-cleared-session', { hadBearer: Boolean(bearer) }, 'warn');
        updateAuthDebug({
          refreshStatus: 'failed',
          activeSessionStatus: 'ended',
        });
        clearPersistedStudentTokens();
        if (bearer) {
          redirectToLoginScreen();
        }
      } finally {
        if (!cancelled && loadId === authSessionLoadGeneration) {
          setLoading(false);
        }
      }
    };

    runSessionRestoreRef.current = async (reason = 'resume') => {
      const attempts = isNativeRuntime ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          await loadSession(reason);
          return;
        } catch (error) {
          if (attempt >= attempts - 1 || !isLikelyTransientAuthFailure(error)) {
            throw error;
          }
          logNativeEvent('auth', 'restore-retry', { reason, attempt: attempt + 1 }, 'warn');
          await delay(600 * (2 ** attempt));
        }
      }
    };

    void runSessionRestoreRef.current('mount');

    return () => {
      cancelled = true;
      runSessionRestoreRef.current = async () => undefined;
    };
  }, [isNativeRuntime]); // Run only on mount to prevent instant logout cycles

  useEffect(() => {
    if (!isNativeRuntime) return;
    void ensureNativeAuthBootstrap('mount');
    const listenerPromise = CapacitorApp
      .addListener('appStateChange', ({ isActive }) => {
        if (isActive) void ensureNativeAuthBootstrap('app-resume');
      })
      .catch(() => null);
    const onOnline = () => {
      void ensureNativeAuthBootstrap('online');
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      void listenerPromise.then((listener) => listener?.remove());
    };
  }, [ensureNativeAuthBootstrap, isNativeRuntime]);

  // Mobile / multi-tab: keep React token in sync with localStorage after resume, refresh, or writes in another tab.
  useEffect(() => {
    if (typeof window === 'undefined' || !shouldPersistAuthTokens()) return;

    const syncFromStorage = () => {
      try {
        setToken(localStorage.getItem(TOKEN_STORAGE_KEY));
        setRefreshToken(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY));
        logNativeEvent('auth', 'sync-from-storage');
      } catch {
        /* ignore */
      }
    };

    const onVisibility = () => {
      if (!document.hidden) {
        syncFromStorage();
        if (isNativeRuntime) {
          void runSessionRestoreRef.current('visibility');
        }
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY || event.key === REFRESH_TOKEN_STORAGE_KEY) {
        syncFromStorage();
      }
    };

    const onFocus = () => {
      syncFromStorage();
      if (isNativeRuntime) {
        void runSessionRestoreRef.current('focus');
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    const appStateListenerPromise = CapacitorApp
      .addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          syncFromStorage();
          if (isNativeRuntime) {
            void runSessionRestoreRef.current('app-resume');
          }
        }
      })
      .catch(() => null);
    const onOnline = () => {
      syncFromStorage();
      if (isNativeRuntime) {
        void runSessionRestoreRef.current('online');
      }
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onOnline);
      void appStateListenerPromise.then((listener) => listener?.remove());
    };
  }, [isNativeRuntime]);

  const login = useCallback<AuthContextValue['login']>(async (email, password, opts) => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase auth is not configured.');
    }
    const auth = await ensureFirebaseAuthReady();
    updateAuthDebug({ firebaseInitialized: Boolean(auth) });
    if (!auth) {
      const bootstrapped = await ensureNativeAuthBootstrap('email-login');
      if (!bootstrapped) {
        throw new Error('Sign-in could not be started on this device. Please retry.');
      }
    }
    const activeAuth = auth || firebaseAuth;
    if (!activeAuth && !isNativeRuntime) {
      throw new Error('Sign-in could not be started on this device. Please retry.');
    }
    const attempts = isNativeRuntime ? 3 : 1;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        let firebaseIdToken = '';
        if (isNativeRuntime) {
          // Android WebView can intermittently fail Firebase web SDK handshakes; use REST as primary login path.
          const rest = await signInWithEmailPasswordRest(email, password);
          firebaseIdToken = rest.idToken;
          updateAuthDebug({ userAuthenticated: true });
          logNativeEvent('auth', 'firebase-rest-login-success', { email: email.toLowerCase() });
        } else {
          try {
            const credential = await signInWithEmailAndPassword(activeAuth as NonNullable<typeof activeAuth>, email, password);
            updateAuthDebug({ userAuthenticated: true });
            firebaseIdToken = await credential.user.getIdToken();
          } catch (firebaseError) {
            throw firebaseError;
          }
        }
        const tokenClaims = decodeJwtClaims(firebaseIdToken);
        logNativeEvent('auth', 'firebase-token-issued', {
          email: email.toLowerCase(),
          aud: tokenClaims.aud || '',
          iss: tokenClaims.iss || '',
          sub: tokenClaims.sub ? `${String(tokenClaims.sub).slice(0, 8)}...` : '',
        });
        updateAuthDebug({
          firebaseTokenGenerated: true,
          tokenAudience: tokenClaims.aud || '',
          tokenIssuer: tokenClaims.iss || '',
          backendLoginStatus: 'pending',
          backendLoginCode: '',
        });
        const payload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
          '/api/auth/login',
          {
            method: 'POST',
            retryCount: isNativeRuntime ? 2 : 1,
            retryDelayMs: 900,
            timeoutMs: 50_000,
            body: JSON.stringify({
              email,
              deviceId,
              firebaseIdToken,
              forceLogoutOtherDevice: Boolean(opts?.forceLogoutOtherDevice || opts?.forceLogin),
              forceLogin: Boolean(opts?.forceLogin || opts?.forceLogoutOtherDevice),
            }),
          },
        );
        const stabilizedPayload = await finalizeNativeAuthTransport(payload, 'login');
        logNativeEvent('auth', 'login-success', { email: email.toLowerCase() });
        updateAuthDebug({
          backendLoginStatus: 'success',
          backendLoginCode: '',
          activeSessionStatus: 'active',
        });
        applyAuthPayload(stabilizedPayload);
        return;
      } catch (error) {
        lastError = error;
        updateAuthDebug({
          backendLoginStatus: 'failed',
          backendLoginCode: extractAuthErrorCode(error),
          activeSessionStatus: extractAuthErrorCode(error) === 'ACTIVE_SESSION_ELSEWHERE' ? 'conflict' : 'unknown',
        });
        if (!isNativeRuntime || attempt >= attempts - 1 || !isLikelyTransientAuthFailure(error)) {
          break;
        }
        logNativeEvent('auth', 'login-retry', { attempt: attempt + 1, email: email.toLowerCase() }, 'warn');
        await delay(650 * (2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Unable to sign in.'));
  }, [applyAuthPayload, deviceId, ensureNativeAuthBootstrap, finalizeNativeAuthTransport, isNativeRuntime]);

  const upsertSocialAuthSession = useCallback(async (params: {
    email: string;
    firebaseIdToken: string;
    firstName?: string;
    lastName?: string;
    forceLogoutOtherDevice?: boolean;
    forceLogin?: boolean;
  }) => {
    try {
      const loginPayload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
        '/api/auth/login',
        {
          method: 'POST',
          retryCount: isNativeRuntime ? 2 : 1,
          retryDelayMs: 900,
          timeoutMs: 50_000,
          body: JSON.stringify({
            email: params.email,
            firebaseIdToken: params.firebaseIdToken,
            deviceId,
            forceLogoutOtherDevice: Boolean(params.forceLogoutOtherDevice || params.forceLogin),
            forceLogin: Boolean(params.forceLogin || params.forceLogoutOtherDevice),
          }),
        },
      );
      const stabilizedPayload = await finalizeNativeAuthTransport(loginPayload, 'social-login');
      updateAuthDebug({
        backendLoginStatus: 'success',
        backendLoginCode: '',
        activeSessionStatus: 'active',
      });
      applyAuthPayload(stabilizedPayload);
      return;
    } catch (error) {
      const typed = error as Error & { status?: number };
      updateAuthDebug({
        backendLoginStatus: 'failed',
        backendLoginCode: extractAuthErrorCode(error),
        activeSessionStatus: extractAuthErrorCode(error) === 'ACTIVE_SESSION_ELSEWHERE' ? 'conflict' : 'unknown',
      });
      if (typed?.status !== 401) {
        throw error;
      }
    }

    const registerPayload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
      '/api/auth/register',
      {
        method: 'POST',
        retryCount: isNativeRuntime ? 2 : 1,
        retryDelayMs: 900,
        timeoutMs: 50_000,
        body: JSON.stringify({
          email: params.email,
          firstName: params.firstName || '',
          lastName: params.lastName || '',
          firebaseIdToken: params.firebaseIdToken,
          deviceId,
        }),
      },
    );
    const stabilizedPayload = await finalizeNativeAuthTransport(registerPayload, 'social-login');
    applyAuthPayload(stabilizedPayload);
  }, [applyAuthPayload, deviceId, finalizeNativeAuthTransport, isNativeRuntime]);

  const loginWithGoogle = useCallback<AuthContextValue['loginWithGoogle']>(async (opts) => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase auth is not configured.');
    }
    const auth = await ensureFirebaseAuthReady();
    updateAuthDebug({ firebaseInitialized: Boolean(auth) });
    if (!auth) {
      const bootstrapped = await ensureNativeAuthBootstrap('google-login');
      if (!bootstrapped) {
        throw new Error('Google sign-in could not start on this device. Please retry.');
      }
    }
    const activeAuth = auth || firebaseAuth;
    if (!activeAuth) {
      throw new Error('Google sign-in could not start on this device. Please retry.');
    }
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });
    if (isAndroidNative) {
      try {
        showNeutralToast('Opening Google sign-in…');
        const { idToken, accessToken } = await signInWithGoogleAndroidNative();
        const googleClaims = decodeJwtClaims(idToken);
        if (typeof console !== 'undefined' && console.error) {
          console.error('[net360/google-native]', JSON.stringify({
            ts: new Date().toISOString(),
            event: 'pre-firebase-credential',
            googleIdAud: googleClaims.aud || undefined,
            googleIdIss: googleClaims.iss || undefined,
            hasAccessToken: Boolean(accessToken),
          }));
        }
        const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
        let userCred;
        try {
          userCred = await signInWithCredential(activeAuth, credential);
        } catch (fe) {
          const feCode = String((fe as { code?: string })?.code || '').trim();
          const feMsg = (fe as Error)?.message || String(fe);
          if (typeof console !== 'undefined' && console.error) {
            console.error('[net360/google-native]', JSON.stringify({
              ts: new Date().toISOString(),
              event: 'firebase-signInWithCredential-failed',
              code: feCode || undefined,
              message: feMsg,
              googleIdAud: googleClaims.aud || undefined,
            }));
          }
          logNativeEvent('auth', 'firebase-signInWithCredential-failed', { code: feCode, message: feMsg }, 'error');
          throw fe;
        }
        if (typeof console !== 'undefined' && console.error) {
          console.error('[net360/google-native]', JSON.stringify({
            ts: new Date().toISOString(),
            event: 'firebase-signInWithCredential-ok',
            uidPrefix: userCred.user.uid ? `${userCred.user.uid.slice(0, 8)}…` : '',
            hasEmail: Boolean(userCred.user.email),
          }));
        }
        updateAuthDebug({ userAuthenticated: true });
        const firebaseIdToken = await userCred.user.getIdToken();
        const tokenClaims = decodeJwtClaims(firebaseIdToken);
        logNativeEvent('auth', 'firebase-token-issued-google-native', {
          aud: tokenClaims.aud || '',
          iss: tokenClaims.iss || '',
          sub: tokenClaims.sub ? `${String(tokenClaims.sub).slice(0, 8)}...` : '',
        });
        updateAuthDebug({
          firebaseTokenGenerated: true,
          tokenAudience: tokenClaims.aud || '',
          tokenIssuer: tokenClaims.iss || '',
        });
        const [firstName = '', ...rest] = String(userCred.user.displayName || '').trim().split(/\s+/);
        const lastName = rest.join(' ').trim();
        const email = String(userCred.user.email || '').trim().toLowerCase();
        if (!email) {
          throw new Error('Google login did not return an email address.');
        }
        await upsertSocialAuthSession({
          email,
          firebaseIdToken,
          firstName,
          lastName,
          forceLogoutOtherDevice: opts?.forceLogoutOtherDevice,
          forceLogin: opts?.forceLogin,
        });
        logNativeEvent('auth', 'google-native-success', { email });
        showSuccessToast('Signed in with Google.');
      } catch (error) {
        const code = String((error as { code?: string })?.code || '').trim();
        if (code === 'USER_CANCELLED') {
          logNativeEvent('auth', 'google-native-cancelled', {});
          throw error;
        }
        const message = (error as Error)?.message || String(error);
        if (typeof console !== 'undefined' && console.error) {
          console.error('[net360/google-native]', JSON.stringify({
            ts: new Date().toISOString(),
            event: 'google-native-outer-catch',
            code: code || undefined,
            message,
          }));
        }
        logNativeEvent('auth', 'google-native-failed', { message }, 'error');
        throw new Error(
          message.includes('auth/')
            ? message
            : 'Google sign-in could not complete on this device. Try again or use email and password.',
        );
      }
      return;
    }
    if (isNativeRuntime) {
      try {
        showNeutralToast('Opening Google sign-in…');
        await signInWithRedirect(activeAuth, provider);
        logNativeEvent('auth', 'google-redirect-started', {});
      } catch (error) {
        const message = (error as Error)?.message || String(error);
        logNativeEvent('auth', 'google-redirect-start-failed', { message }, 'error');
        throw new Error(
          message.includes('auth/')
            ? message
            : 'Google sign-in could not start on this device. Try again or use email and password.',
        );
      }
      return;
    }
    const credential = await signInWithPopup(activeAuth, provider);
    updateAuthDebug({ userAuthenticated: true });
    const firebaseIdToken = await credential.user.getIdToken();
    const tokenClaims = decodeJwtClaims(firebaseIdToken);
    logNativeEvent('auth', 'firebase-token-issued-google', {
      aud: tokenClaims.aud || '',
      iss: tokenClaims.iss || '',
      sub: tokenClaims.sub ? `${String(tokenClaims.sub).slice(0, 8)}...` : '',
    });
    updateAuthDebug({
      firebaseTokenGenerated: true,
      tokenAudience: tokenClaims.aud || '',
      tokenIssuer: tokenClaims.iss || '',
    });
    const [firstName = '', ...rest] = String(credential.user.displayName || '').trim().split(/\s+/);
    const lastName = rest.join(' ').trim();
    const email = String(credential.user.email || '').trim().toLowerCase();
    if (!email) {
      throw new Error('Google login did not return an email address.');
    }
    await upsertSocialAuthSession({
      email,
      firebaseIdToken,
      firstName,
      lastName,
      forceLogoutOtherDevice: opts?.forceLogoutOtherDevice,
      forceLogin: opts?.forceLogin,
    });
    logNativeEvent('auth', 'google-popup-success');
  }, [ensureNativeAuthBootstrap, isAndroidNative, isNativeRuntime, upsertSocialAuthSession]);

  useEffect(() => {
    if (!isNativeRuntime || !isFirebaseConfigured() || isAndroidNative) return;
    let cancelled = false;

    void (async () => {
      try {
        const auth = await ensureFirebaseAuthReady();
        if (!auth) return;
        logNativeEvent('auth', 'google-redirect-init', { ready: true });
        let result = await getRedirectResult(auth);
        if (!result?.user) {
          await delay(220);
          result = await getRedirectResult(auth);
        }
        if (!result?.user || cancelled) return;
        const firebaseIdToken = await result.user.getIdToken();
        const [firstName = '', ...rest] = String(result.user.displayName || '').trim().split(/\s+/);
        const lastName = rest.join(' ').trim();
        const email = String(result.user.email || '').trim().toLowerCase();
        if (!email) {
          throw new Error('Google login did not return an email address.');
        }
        await upsertSocialAuthSession({ email, firebaseIdToken, firstName, lastName });
        logNativeEvent('auth', 'google-redirect-complete', { email });
        showSuccessToast('Signed in with Google.');
      } catch (error) {
        if (!cancelled) {
          logNativeEvent('auth', 'google-redirect-failed', {
            message: (error as Error)?.message || String(error),
          }, 'warn');
          if (!isLikelyTransientAuthFailure(error)) {
            showWarningToast((error as Error)?.message || 'Google login could not be completed on this device.');
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAndroidNative, isNativeRuntime, upsertSocialAuthSession]);

  const registerWithToken = useCallback<AuthContextValue['registerWithToken']>(async ({
    email,
    password,
    firstName = '',
    lastName = '',
  }) => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase auth is not configured.');
    }
    const auth = await ensureFirebaseAuthReady();
    if (!auth) {
      const bootstrapped = await ensureNativeAuthBootstrap('register');
      if (!bootstrapped) {
        throw new Error('Account setup could not start on this device. Please retry.');
      }
    }
    const activeAuth = auth || firebaseAuth;
    if (!activeAuth) {
      throw new Error('Account setup could not start on this device. Please retry.');
    }
    const credential = await createUserWithEmailAndPassword(activeAuth, email, password);
    const firebaseIdToken = await credential.user.getIdToken();
    let payload: { token?: string; refreshToken?: string; user: AuthUser };
    try {
      payload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
        '/api/auth/register',
        {
          method: 'POST',
          retryCount: 1,
          timeoutMs: 45_000,
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            deviceId,
            firebaseIdToken,
          }),
        },
      );
    } catch (error) {
      await deleteUser(credential.user).catch(() => undefined);
      throw error;
    }

    const stabilizedPayload = await finalizeNativeAuthTransport(payload, 'register');
    applyAuthPayload(stabilizedPayload);
  }, [applyAuthPayload, deviceId, ensureNativeAuthBootstrap, finalizeNativeAuthTransport]);

  const sendRecoveryEmail = useCallback<AuthContextValue['sendRecoveryEmail']>(async (email) => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase auth is not configured.');
    }
    const auth = await ensureFirebaseAuthReady();
    const activeAuth = auth || firebaseAuth;
    if (!activeAuth) {
      throw new Error('Password recovery could not start on this device. Please retry.');
    }
    await sendPasswordResetEmail(activeAuth, email);
  }, []);

  const clearClientAuthState = useCallback(() => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    clearPersistedStudentTokens();
    clearSessionStorageSafe();
    clearLocalStorageAuthStateSafe();
  }, []);

  const logout = useCallback(() => {
    const rt = shouldPersistAuthTokens() ? refreshToken : null;
    void apiRequest('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify(rt ? { refreshToken: rt } : {}),
    }).catch(() => undefined);
    clearClientAuthState();
    if (firebaseAuth) {
      void signOut(firebaseAuth).catch(() => undefined);
    }
  }, [clearClientAuthState, refreshToken]);

  const deleteAccount = useCallback<AuthContextValue['deleteAccount']>(async ({ password, confirmationText }) => {
    const payload = await apiRequest<{ message: string }>('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password, confirmationText }),
      timeoutMs: 60_000,
      retryCount: 0,
    });
    clearClientAuthState();
    if (firebaseAuth) {
      await signOut(firebaseAuth).catch(() => undefined);
    }
    redirectToLoginScreen();
    return payload;
  }, [clearClientAuthState]);

  useEffect(() => {
    const onRevoked = (ev: Event) => {
      const detail = (ev as CustomEvent<{ previousSessionId?: string }>).detail;
      const prev = String(detail?.previousSessionId || '').trim();
      if (!prev) return;
      const mine = readSessionIdFromAccessToken();
      if (mine && mine === prev) {
        showWarningToast('You were signed out because your account was opened on another device.');
        logout();
      }
    };
    window.addEventListener('net360:session-revoked', onRevoked);
    return () => window.removeEventListener('net360:session-revoked', onRevoked);
  }, [logout]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      loginWithGoogle,
      registerWithToken,
      sendRecoveryEmail,
      deleteAccount,
      logout,
    }),
    [token, user, loading, login, loginWithGoogle, registerWithToken, sendRecoveryEmail, deleteAccount, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

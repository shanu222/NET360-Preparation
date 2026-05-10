import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  deleteUser,
  GoogleAuthProvider,
  sendPasswordResetEmail,
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
import { firebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { showWarningToast } from '../lib/userToast';
import { isNativeRuntime as isNativeRuntimePlatform, logNativeEvent } from '../lib/nativeDiagnostics';

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
  login: (email: string, password: string, opts?: { forceLogoutOtherDevice?: boolean }) => Promise<void>;
  loginWithGoogle: (opts?: { forceLogoutOtherDevice?: boolean }) => Promise<void>;
  registerWithToken: (params: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  sendRecoveryEmail: (email: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'net360-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'net360-auth-refresh-token';
const DEVICE_STORAGE_KEY = 'net360-device-id';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) return existing;
  const created = `device-${Date.now()}-${Math.round(Math.random() * 1000000)}`;
  localStorage.setItem(DEVICE_STORAGE_KEY, created);
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

let authSessionLoadGeneration = 0;

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

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
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
          const me = await apiRequest<{ user: AuthUser }>('/api/auth/me', {}, bearer);
          if (cancelled || loadId !== authSessionLoadGeneration) return;
          logNativeEvent('auth', 'restore-from-me-success', { hasBearer: Boolean(bearer) });
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
              { method: 'POST', body: JSON.stringify({ refreshToken: rt }) },
            );
            if (cancelled || loadId !== authSessionLoadGeneration) return;
            logNativeEvent('auth', 'restore-from-refresh-success');
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
              { method: 'POST', body: JSON.stringify({}) },
            );
            if (cancelled || loadId !== authSessionLoadGeneration) return;
            logNativeEvent('auth', 'restore-from-cookie-refresh-success');
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
        clearPersistedStudentTokens();
        if (bearer) {
          redirectToLoginScreen();
        }
      } finally {
        if (!cancelled && loadId === authSessionLoadGeneration) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []); // Run only on mount to prevent instant logout cycles

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
      if (!document.hidden) syncFromStorage();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY || event.key === REFRESH_TOKEN_STORAGE_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener('focus', syncFromStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    const appStateListenerPromise = CapacitorApp
      .addListener('appStateChange', ({ isActive }) => {
        if (isActive) syncFromStorage();
      })
      .catch(() => null);
    return () => {
      window.removeEventListener('focus', syncFromStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      void appStateListenerPromise.then((listener) => listener?.remove());
    };
  }, []);

  const login = useCallback<AuthContextValue['login']>(async (email, password, opts) => {
    if (!isFirebaseConfigured() || !firebaseAuth) {
      throw new Error('Firebase auth is not configured.');
    }
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const firebaseIdToken = await credential.user.getIdToken();
    const payload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        retryCount: 1,
        timeoutMs: 45_000,
        body: JSON.stringify({
          email,
          deviceId,
          firebaseIdToken,
          forceLogoutOtherDevice: Boolean(opts?.forceLogoutOtherDevice),
        }),
      },
    );
    logNativeEvent('auth', 'login-success', { email: email.toLowerCase() });
    applyAuthPayload(payload);
  }, [applyAuthPayload, deviceId]);

  const upsertSocialAuthSession = useCallback(async (params: {
    email: string;
    firebaseIdToken: string;
    firstName?: string;
    lastName?: string;
    forceLogoutOtherDevice?: boolean;
  }) => {
    try {
      const loginPayload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
        '/api/auth/login',
        {
          method: 'POST',
          retryCount: 1,
          timeoutMs: 45_000,
          body: JSON.stringify({
            email: params.email,
            firebaseIdToken: params.firebaseIdToken,
            deviceId,
            forceLogoutOtherDevice: Boolean(params.forceLogoutOtherDevice),
          }),
        },
      );
      applyAuthPayload(loginPayload);
      return;
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed?.status !== 401) {
        throw error;
      }
    }

    const registerPayload = await apiRequest<{ token?: string; refreshToken?: string; user: AuthUser }>(
      '/api/auth/register',
      {
        method: 'POST',
        retryCount: 1,
        timeoutMs: 45_000,
        body: JSON.stringify({
          email: params.email,
          firstName: params.firstName || '',
          lastName: params.lastName || '',
          firebaseIdToken: params.firebaseIdToken,
          deviceId,
        }),
      },
    );
    applyAuthPayload(registerPayload);
  }, [applyAuthPayload, deviceId]);

  const loginWithGoogle = useCallback<AuthContextValue['loginWithGoogle']>(async (opts) => {
    if (!isFirebaseConfigured() || !firebaseAuth) {
      throw new Error('Firebase auth is not configured.');
    }
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });
    if (isNativeRuntime) {
      logNativeEvent('auth', 'google-redirect-start');
      await signInWithRedirect(firebaseAuth, provider);
      return;
    }
    const credential = await signInWithPopup(firebaseAuth, provider);
    const firebaseIdToken = await credential.user.getIdToken();
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
    });
    logNativeEvent('auth', 'google-popup-success');
  }, [isNativeRuntime, upsertSocialAuthSession]);

  useEffect(() => {
    if (!isNativeRuntime || !isFirebaseConfigured() || !firebaseAuth) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await getRedirectResult(firebaseAuth);
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
      } catch (error) {
        if (!cancelled) {
          logNativeEvent('auth', 'google-redirect-failed', {
            message: (error as Error)?.message || String(error),
          }, 'warn');
          showWarningToast((error as Error)?.message || 'Google login could not be completed on this device.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNativeRuntime, upsertSocialAuthSession]);

  const registerWithToken = useCallback<AuthContextValue['registerWithToken']>(async ({
    email,
    password,
    firstName = '',
    lastName = '',
  }) => {
    if (!isFirebaseConfigured() || !firebaseAuth) {
      throw new Error('Firebase auth is not configured.');
    }
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
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

    applyAuthPayload(payload);
  }, [applyAuthPayload, deviceId]);

  const sendRecoveryEmail = useCallback<AuthContextValue['sendRecoveryEmail']>(async (email) => {
    if (!isFirebaseConfigured() || !firebaseAuth) {
      throw new Error('Firebase auth is not configured.');
    }
    await sendPasswordResetEmail(firebaseAuth, email);
  }, []);

  const logout = useCallback(() => {
    const rt = shouldPersistAuthTokens() ? refreshToken : null;
    void apiRequest('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify(rt ? { refreshToken: rt } : {}),
    }).catch(() => undefined);
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    clearPersistedStudentTokens();
    if (firebaseAuth) {
      void signOut(firebaseAuth).catch(() => undefined);
    }
  }, [refreshToken]);

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
      logout,
    }),
    [token, user, loading, login, loginWithGoogle, registerWithToken, sendRecoveryEmail, logout],
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

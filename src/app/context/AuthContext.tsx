import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  COOKIE_SESSION_API_MARKER,
  clearPersistedStudentTokens,
  hasStoredAuthCredentials,
  isCookieSessionApiMarker,
  persistCookieSessionMode,
  persistStudentTokens,
  shouldPersistAuthTokens,
} from '../lib/authSession';
import { firebaseAuth, isFirebaseConfigured } from '../lib/firebase';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: 'student' | 'admin';
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, opts?: { forceLogoutOtherDevice?: boolean }) => Promise<void>;
  registerWithToken: (params: {
    email: string;
    password: string;
    mobileNumber: string;
    firstName?: string;
    lastName?: string;
    securityQuestion: string;
    securityAnswer: string;
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
          setUser(me.user);
          if (!bearer) {
            setToken(COOKIE_SESSION_API_MARKER);
            persistCookieSessionMode();
          } else {
            setToken(storedToken);
          }
          console.log('Auth state: authenticated as', me.user.email);
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
    return () => {
      window.removeEventListener('focus', syncFromStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
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
        body: JSON.stringify({
          email,
          deviceId,
          firebaseIdToken,
          forceLogoutOtherDevice: Boolean(opts?.forceLogoutOtherDevice),
        }),
      },
    );

    setUser(payload.user);
    if (payload.token && shouldPersistAuthTokens()) {
      setToken(payload.token);
      setRefreshToken(payload.refreshToken ?? null);
      persistStudentTokens(payload.token, payload.refreshToken ?? null);
      console.log("Token after login:", localStorage.getItem(TOKEN_STORAGE_KEY));
    } else {
      setToken(COOKIE_SESSION_API_MARKER);
      setRefreshToken(null);
      persistCookieSessionMode();
    }
  }, [deviceId]);

  const registerWithToken = useCallback<AuthContextValue['registerWithToken']>(async ({
    email,
    password,
    mobileNumber,
    firstName = '',
    lastName = '',
    securityQuestion,
    securityAnswer,
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
          body: JSON.stringify({
            email,
            mobileNumber,
            firstName,
            lastName,
            securityQuestion,
            securityAnswer,
            deviceId,
            firebaseIdToken,
          }),
        },
      );
    } catch (error) {
      await deleteUser(credential.user).catch(() => undefined);
      throw error;
    }

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
  }, [deviceId]);

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

  const value = useMemo(
    () => ({ token, user, loading, login, registerWithToken, sendRecoveryEmail, logout }),
    [token, user, loading, login, registerWithToken, sendRecoveryEmail, logout],
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

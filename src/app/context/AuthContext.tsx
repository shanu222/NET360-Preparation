import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: 'student' | 'admin';
}

interface ActiveSessionInfo {
  deviceId: string;
  lastSeenAt: string;
}

interface AuthApiError extends Error {
  code?: string;
  activeSession?: ActiveSessionInfo;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, opts?: { forceLogoutOtherDevice?: boolean }) => Promise<void>;
  submitSignupRequest: (params: {
    email: string;
    firstName?: string;
    lastName?: string;
    mobileNumber: string;
    paymentMethod: 'easypaisa' | 'jazzcash' | 'bank_transfer';
    paymentTransactionId: string;
    paymentProof: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    };
  }) => Promise<void>;
  registerWithToken: (params: {
    email: string;
    password: string;
    tokenCode: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMe() {
      setLoading(true);
      try {
        const payload = await apiRequest<{ user: AuthUser }>('/api/auth/me', {}, token);
        if (!cancelled) {
          setUser(payload.user);
        }
      } catch {
        if (cancelled) return;

        if (!refreshToken) {
          setToken(null);
          setUser(null);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
          return;
        }

        try {
          const refreshed = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });

          if (!cancelled) {
            setToken(refreshed.token);
            setRefreshToken(refreshed.refreshToken);
            setUser(refreshed.user);
            localStorage.setItem(TOKEN_STORAGE_KEY, refreshed.token);
            localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshed.refreshToken);
          }
        } catch {
          if (!cancelled) {
            setToken(null);
            setRefreshToken(null);
            setUser(null);
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMe();

    return () => {
      cancelled = true;
    };
  }, [token, refreshToken]);

  const login: AuthContextValue['login'] = async (email, password, opts) => {
    try {
      const payload = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            deviceId,
            forceLogoutOtherDevice: Boolean(opts?.forceLogoutOtherDevice),
          }),
        },
      );

      setToken(payload.token);
      setRefreshToken(payload.refreshToken);
      setUser(payload.user);
      localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
    } catch (error) {
      if (error && typeof error === 'object') {
        const typed = error as AuthApiError;
        if (typeof (error as any).code === 'string') {
          typed.code = (error as any).code;
          typed.activeSession = (error as any).activeSession;
        }
        throw typed;
      }
      throw error;
    }
  };

  const submitSignupRequest: AuthContextValue['submitSignupRequest'] = async ({
    email,
    firstName = '',
    lastName = '',
    mobileNumber,
    paymentMethod,
    paymentTransactionId,
    paymentProof,
  }) => {
    await apiRequest('/api/auth/signup-request', {
      method: 'POST',
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        mobileNumber,
        paymentMethod,
        paymentTransactionId,
        paymentProof,
      }),
    });
  };

  const registerWithToken: AuthContextValue['registerWithToken'] = async ({
    email,
    password,
    tokenCode,
    firstName = '',
    lastName = '',
  }) => {
    const payload = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>(
      '/api/auth/register-with-token',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, tokenCode, firstName, lastName, deviceId }),
      },
    );

    setToken(payload.token);
    setRefreshToken(payload.refreshToken);
    setUser(payload.user);
    localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
  };

  const logout = () => {
    if (refreshToken) {
      void apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  };

  const value = useMemo(
    () => ({ token, user, loading, login, submitSignupRequest, registerWithToken, logout }),
    [token, user, loading],
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

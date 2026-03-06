import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  blocked?: boolean;
}

interface ActiveSessionError extends Error {
  code?: string;
  activeSession?: {
    id: string;
    deviceId: string;
    lastSeenAt: string;
  };
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
    paymentReference: string;
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
        if (!cancelled) {
          setToken(null);
          setUser(null);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
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
  }, [token]);

  const login = async (email: string, password: string, opts?: { forceLogoutOtherDevice?: boolean }) => {
    try {
      const payload = await apiRequest<{ token: string; user: AuthUser }>(
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
      setUser(payload.user);
      localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
    } catch (error) {
      if (error && typeof error === 'object') {
        const apiError = error as ActiveSessionError;
        if (typeof (error as any).code === 'string') {
          apiError.code = (error as any).code;
          apiError.activeSession = (error as any).activeSession;
        }
        throw apiError;
      }
      throw error;
    }
  };

  const submitSignupRequest: AuthContextValue['submitSignupRequest'] = async ({
    email,
    firstName = '',
    lastName = '',
    paymentReference,
  }) => {
    await apiRequest<{ request: { id: string } }>('/api/auth/signup-request', {
      method: 'POST',
      body: JSON.stringify({ email, firstName, lastName, paymentReference }),
    });
  };

  const registerWithToken: AuthContextValue['registerWithToken'] = async ({
    email,
    password,
    tokenCode,
    firstName = '',
    lastName = '',
  }) => {
    const payload = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/register-with-token', {
      method: 'POST',
      body: JSON.stringify({ email, password, tokenCode, firstName, lastName, deviceId }),
    });

    setToken(payload.token);
    setUser(payload.user);
    localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
  };

  const logout = () => {
    if (token) {
      void apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }, token).catch(() => undefined);
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
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

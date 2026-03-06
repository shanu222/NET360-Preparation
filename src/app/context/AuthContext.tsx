import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

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
  login: (email: string, password: string) => Promise<void>;
  register: (params: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'net360-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'net360-auth-refresh-token';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const login = async (email: string, password: string) => {
    const payload = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(payload.token);
    setRefreshToken(payload.refreshToken);
    setUser(payload.user);
    localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
  };

  const register = async ({ email, password, firstName = '', lastName = '' }: { email: string; password: string; firstName?: string; lastName?: string }) => {
    const payload = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName }),
    });
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
    () => ({ token, user, loading, login, register, logout }),
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

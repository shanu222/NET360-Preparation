import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Primary app session key (AuthContext). Generic `token` also accepted for compatibility. */
const AUTH_TOKEN_KEYS = ['net360-auth-token', 'token'] as const;

function readStoredAuthCredential(): string | null {
  if (typeof localStorage === 'undefined') return null;
  for (const key of AUTH_TOKEN_KEYS) {
    const v = localStorage.getItem(key);
    if (v) return v;
  }
  return null;
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Soft UX only:
 * - `/` + no session → `/login`
 * - `/login` + session → `/` (dashboard; app has no `/dashboard` route)
 * All other paths are never blocked.
 */
export function SoftAuthRedirect({ children }: { children: React.ReactNode }) {
  const { user, loading, token } = useAuth();
  const location = useLocation();
  const path = normalizePathname(location.pathname);

  if (path === '/login') {
    if (!loading && user) {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  if (path === '/') {
    const stored = readStoredAuthCredential();
    const hasCredential = Boolean(token || stored);

    if (loading && hasCredential) {
      return (
        <div className="net360-viewport flex min-h-dvh items-center justify-center bg-[#f5f6ff] p-4 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-sm text-indigo-800 dark:text-indigo-200">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span>Loading session…</span>
          </div>
        </div>
      );
    }

    if (!user) {
      return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
  }

  return <>{children}</>;
}

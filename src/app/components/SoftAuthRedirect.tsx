import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Matches AuthContext storage; used for instant root checks without waiting on context hydration. */
const AUTH_TOKEN_STORAGE_KEY = 'net360-auth-token';

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Soft UX redirects only:
 * - `/` + no session → `/login`
 * - `/login` + session → `/` (dashboard)
 * Other routes are never blocked (direct URLs, SEO pages, assets unaffected).
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
    const storedToken =
      typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
    const hasCredential = Boolean(token || storedToken);

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

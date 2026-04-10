import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** UX-only: supports app key `net360-auth-token` and generic `token` (per product spec). */
function hasStoredAuthCredential(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return Boolean(localStorage.getItem('token') || localStorage.getItem('net360-auth-token'));
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Soft landing only — no global route protection.
 * - `/` + no session → `/login`
 * - `/` + session → dashboard (this app uses `/`, not `/dashboard`)
 * - `/login` + session → `/`
 * Any other path is always allowed through unchanged.
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
    const stored = hasStoredAuthCredential();
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

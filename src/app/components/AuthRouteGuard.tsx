import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LOGIN_PATH = '/login';

function normalizePath(pathname: string): string {
  if (pathname === '/') return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function AuthRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, token } = useAuth();
  const location = useLocation();
  const path = normalizePath(location.pathname);
  const isLoginPage = path === LOGIN_PATH;

  if (isLoginPage) {
    if (!loading && user) {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  if (loading && token) {
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
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

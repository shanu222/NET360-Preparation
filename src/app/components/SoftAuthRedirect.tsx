import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * UX-only: logged-in users are sent away from `/login` to home.
 * Dashboard (`/` and `/dashboard` alias) is public — no redirect to login.
 */
export function SoftAuthRedirect({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const path = normalizePathname(location.pathname);

  if (path === '/login') {
    if (!loading && user) {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  return <>{children}</>;
}

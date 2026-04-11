/**
 * Production web builds prefer httpOnly cookies (no JWT in localStorage).
 * Enable VITE_STORE_AUTH_TOKENS=true for Capacitor / embedded WebViews that need bearer tokens.
 */
export function shouldPersistAuthTokens(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {};
  if (env.DEV === true) return true;
  return String(env.VITE_STORE_AUTH_TOKENS || '').toLowerCase() === 'true';
}

/** Use as apiRequest "token" when the access token lives only in cookies (omit Authorization). */
export const COOKIE_SESSION_API_MARKER = '__net360_cookie_session__';

export function isCookieSessionApiMarker(value: string | null | undefined): boolean {
  return value === COOKIE_SESSION_API_MARKER;
}

export function persistStudentTokens(access: string | null, refresh: string | null) {
  if (!shouldPersistAuthTokens()) return;
  if (access) localStorage.setItem('net360-auth-token', access);
  else localStorage.removeItem('net360-auth-token');
  if (refresh) localStorage.setItem('net360-auth-refresh-token', refresh);
  else localStorage.removeItem('net360-auth-refresh-token');
}

export function clearPersistedStudentTokens() {
  localStorage.removeItem('net360-auth-token');
  localStorage.removeItem('net360-auth-refresh-token');
}

/** Omit cookie-only sessions from query strings / launch payloads (avoid useless markers in URLs). */
export function bearerForLaunchUrl(authToken: string | null | undefined): string | null {
  if (!authToken || isCookieSessionApiMarker(authToken)) return null;
  return authToken;
}

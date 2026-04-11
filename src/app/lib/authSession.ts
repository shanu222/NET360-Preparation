/**
 * Production web builds prefer httpOnly cookies (no JWT in localStorage).
 * Enable VITE_STORE_AUTH_TOKENS=true for Capacitor / embedded WebViews that need bearer tokens.
 */
export function shouldPersistAuthTokens(): boolean {
  return true; // Always store in localStorage to ensure mobile and desktop session persistence
}

/** Use as apiRequest "token" when the access token lives only in cookies (omit Authorization). */
export const COOKIE_SESSION_API_MARKER = '__net360_cookie_session__';

export function isCookieSessionApiMarker(value: string | null | undefined): boolean {
  return value === COOKIE_SESSION_API_MARKER;
}

const STUDENT_ACCESS_KEY = 'net360-auth-token';
const STUDENT_REFRESH_KEY = 'net360-auth-refresh-token';

/** Persist cookie-only session hint so AppData / exam flows see a stable token (Authorization omitted; fetch uses credentials). */
export function persistCookieSessionMode() {
  if (!shouldPersistAuthTokens()) return;
  localStorage.setItem(STUDENT_ACCESS_KEY, COOKIE_SESSION_API_MARKER);
  localStorage.removeItem(STUDENT_REFRESH_KEY);
}

/** Read stored student access JWT or cookie-session marker (same key as AuthContext). */
export function readPersistedStudentAccessToken(): string | null {
  if (!shouldPersistAuthTokens()) return null;
  return localStorage.getItem(STUDENT_ACCESS_KEY);
}

export function persistStudentTokens(access: string | null, refresh: string | null) {
  if (!shouldPersistAuthTokens()) return;
  if (access) localStorage.setItem(STUDENT_ACCESS_KEY, access);
  else localStorage.removeItem(STUDENT_ACCESS_KEY);
  if (refresh) localStorage.setItem(STUDENT_REFRESH_KEY, refresh);
  else localStorage.removeItem(STUDENT_REFRESH_KEY);
}

export function clearPersistedStudentTokens() {
  localStorage.removeItem(STUDENT_ACCESS_KEY);
  localStorage.removeItem(STUDENT_REFRESH_KEY);
}

/** Omit cookie-only sessions from query strings / launch payloads (avoid useless markers in URLs). */
export function bearerForLaunchUrl(authToken: string | null | undefined): string | null {
  if (!authToken || isCookieSessionApiMarker(authToken)) return null;
  return authToken;
}

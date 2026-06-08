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
export const ADMIN_ACCESS_KEY = 'net360-admin-access-token';
export const ADMIN_REFRESH_KEY = 'net360-admin-refresh-token';

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Quota, private mode, or WebView storage blocked */
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Persist cookie-only session hint so AppData / exam flows see a stable token (Authorization omitted; fetch uses credentials). */
export function persistCookieSessionMode() {
  if (!shouldPersistAuthTokens()) return;
  lsSet(STUDENT_ACCESS_KEY, COOKIE_SESSION_API_MARKER);
  lsRemove(STUDENT_REFRESH_KEY);
}

/** Read stored student access JWT or cookie-session marker (same key as AuthContext). */
export function readPersistedStudentAccessToken(): string | null {
  if (!shouldPersistAuthTokens()) return null;
  return lsGet(STUDENT_ACCESS_KEY);
}

/** Read `sessionId` claim from stored JWT (no verification; server validates). */
export function readSessionIdFromAccessToken(): string | null {
  const raw = readPersistedStudentAccessToken();
  if (!raw || raw === COOKIE_SESSION_API_MARKER) return null;
  try {
    const part = raw.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad));
    return typeof json?.sessionId === 'string' ? json.sessionId : null;
  } catch {
    return null;
  }
}

/** True if localStorage has any student auth material (JWT, cookie-session marker, or refresh token). */
export function hasStoredAuthCredentials(): boolean {
  if (!shouldPersistAuthTokens() || typeof localStorage === 'undefined') return false;
  const access = lsGet(STUDENT_ACCESS_KEY);
  const refresh = lsGet(STUDENT_REFRESH_KEY);
  return Boolean((access && access.trim()) || (refresh && refresh.trim()));
}

/**
 * Synchronous auth snapshot for gating API calls (context token, localStorage, or cookie-session marker when user exists).
 * Matches AppDataContext.resolveClientAuthToken without needing a hook.
 */
export function resolveSnapshotStudentAuthToken(
  contextToken: string | null | undefined,
  user: unknown,
): string | null {
  if (contextToken) return contextToken;
  const stored = readPersistedStudentAccessToken();
  if (stored) return stored;
  if (user) return COOKIE_SESSION_API_MARKER;
  return null;
}

/**
 * Whether the client can attempt authenticated student API calls.
 * Re-reads localStorage so mobile Safari is not blocked when React state lags behind persisted JWT/marker.
 */
export function hasResolvableStudentAuth(
  contextToken: string | null | undefined,
  user: unknown,
): boolean {
  if (resolveSnapshotStudentAuthToken(contextToken, user)) return true;
  return Boolean(readPersistedStudentAccessToken());
}

/** Debug-only: avoids logging full JWTs. */
export function formatStudentTokenDebugPreview(): string {
  const raw = readPersistedStudentAccessToken();
  if (!raw) return '(none)';
  if (raw === COOKIE_SESSION_API_MARKER) return 'cookie-session-marker';
  if (raw.length <= 12) return `${raw.slice(0, 4)}…`;
  return `${raw.slice(0, 8)}…`;
}

export function persistStudentTokens(access: string | null, refresh: string | null) {
  if (!shouldPersistAuthTokens()) return;
  if (access) lsSet(STUDENT_ACCESS_KEY, access);
  else lsRemove(STUDENT_ACCESS_KEY);
  if (refresh) lsSet(STUDENT_REFRESH_KEY, refresh);
  else lsRemove(STUDENT_REFRESH_KEY);
}

export function clearPersistedStudentTokens() {
  lsRemove(STUDENT_ACCESS_KEY);
  lsRemove(STUDENT_REFRESH_KEY);
}

/** Omit cookie-only sessions from query strings / launch payloads (avoid useless markers in URLs). */
export function bearerForLaunchUrl(authToken: string | null | undefined): string | null {
  if (!authToken || isCookieSessionApiMarker(authToken)) return null;
  return authToken;
}

export function readPersistedAdminAccessToken(): string | null {
  return lsGet(ADMIN_ACCESS_KEY);
}

export function readPersistedAdminRefreshToken(): string | null {
  return lsGet(ADMIN_REFRESH_KEY);
}

export function hasStoredAdminCredentials(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const access = lsGet(ADMIN_ACCESS_KEY);
  const refresh = lsGet(ADMIN_REFRESH_KEY);
  return Boolean((access && access.trim()) || (refresh && refresh.trim()));
}

export function persistAdminTokens(access: string | null, refresh: string | null) {
  if (access) lsSet(ADMIN_ACCESS_KEY, access);
  else lsRemove(ADMIN_ACCESS_KEY);
  if (refresh) lsSet(ADMIN_REFRESH_KEY, refresh);
  else lsRemove(ADMIN_REFRESH_KEY);
}

export function clearPersistedAdminTokens() {
  lsRemove(ADMIN_ACCESS_KEY);
  lsRemove(ADMIN_REFRESH_KEY);
}

/** True when the SPA is on an admin route (used for token routing, not security). */
export function isAdminPanelRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = String(window.location.pathname || '').toLowerCase();
  if (path.startsWith('/admin')) return true;
  const host = String(window.location.hostname || '').toLowerCase();
  return host.includes('net360-admin') || host.startsWith('admin.');
}

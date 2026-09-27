import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

/**
 * SPA navigation bridge for code that sits outside React route components
 * (exam launch helpers, auth redirects). Wired once from StudentAuthLayout.
 */
let navigateImpl: NavigateFunction | null = null;

export function registerAppNavigate(navigate: NavigateFunction | null) {
  navigateImpl = navigate;
}

export function appNavigate(to: To, options?: NavigateOptions) {
  if (navigateImpl) {
    navigateImpl(to, options);
    return;
  }
  const href = typeof to === 'string' ? to : `${to.pathname || '/'}${to.search || ''}${to.hash || ''}`;
  window.location.assign(href);
}

/**
 * Same-origin navigation into the exam experience.
 * Production policy: never open about:blank popups / new windows for tests.
 * Uses client-side routing when the student shell is mounted (keeps auth warm).
 */
const LAUNCHED_SESSION_CACHE_KEY = 'net360-exam-session-cache';

export function cacheLaunchedExamSession(session: { id?: string } | null | undefined) {
  if (typeof window === 'undefined' || !session?.id) return;
  try {
    window.sessionStorage.setItem(LAUNCHED_SESSION_CACHE_KEY, JSON.stringify({
      id: String(session.id),
      session,
      cachedAt: Date.now(),
    }));
  } catch {
    /* quota / private mode */
  }
}

export function readCachedLaunchedExamSession<T>(sessionId: string | null | undefined): T | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = window.sessionStorage.getItem(LAUNCHED_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; session?: T; cachedAt?: number };
    if (String(parsed?.id || '') !== String(sessionId)) return null;
    if (parsed.cachedAt && Date.now() - Number(parsed.cachedAt) > 5 * 60_000) return null;
    return parsed.session || null;
  } catch {
    return null;
  }
}

export function navigateToExamSameTab(pathWithSearch: string): void {
  const target = new URL(pathWithSearch, window.location.origin);
  const next = `${target.pathname}${target.search}${target.hash}`;
  if (navigateImpl) {
    navigateImpl(next);
    return;
  }
  window.location.assign(target.toString());
}

/**
 * Leave the exam shell for the main student app without a full document reload
 * when SPA routing is available.
 */
export function leaveExamToApp(path: string, options?: NavigateOptions) {
  const normalized = normalizeStudentAppPath(path);
  if (navigateImpl) {
    navigateImpl(normalized, { replace: true, ...options });
    return;
  }
  window.location.assign(normalized);
}

/** Map legacy `/?tab=tests` style paths to canonical student routes. */
export function normalizeStudentAppPath(path: string): string {
  const raw = String(path || '/').trim() || '/';
  if (raw.startsWith('/?') || raw.startsWith('?')) {
    const query = raw.startsWith('/?') ? raw.slice(2) : raw.slice(1);
    const tab = new URLSearchParams(query).get('tab');
    if (tab === 'tests') return '/tests';
    if (tab === 'community') return '/community';
    if (tab === 'profile') return '/profile';
    if (tab === 'home' || tab === 'dashboard') return '/';
    return '/';
  }
  if (raw === '/?tab=tests') return '/tests';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * @deprecated Prefer navigateToExamSameTab — popups are no longer used for student tests.
 */
export function assignExamPopupLocation(examWindow: Window, pathWithSearch: string): void {
  const target = new URL(pathWithSearch, window.location.origin).toString();
  try {
    examWindow.location.replace(target);
  } catch {
    examWindow.location.href = target;
  }
}

/**
 * @deprecated Prefer navigateToExamSameTab — popups are no longer used for student tests.
 */
export function openExamBlankPopup(): Window | null {
  return null;
}

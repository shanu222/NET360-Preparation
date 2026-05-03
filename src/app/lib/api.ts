import {
  COOKIE_SESSION_API_MARKER,
  hasStoredAuthCredentials,
  isCookieSessionApiMarker,
  persistStudentTokens,
  shouldPersistAuthTokens,
} from './authSession';

type RuntimeEnv = {
  VITE_ADMIN_ONLY?: string;
  DEV?: boolean;
};

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
};

const env = ((import.meta as ImportMeta & { env?: RuntimeEnv }).env || {}) as RuntimeEnv;

if (!import.meta.env.VITE_API_URL) {
  throw new Error('Missing VITE_API_URL in production');
}

export const API_BASE = String(import.meta.env.VITE_API_URL).replace(/\/$/, '').trim();

if (!API_BASE) {
  throw new Error('Missing VITE_API_URL in production');
}

console.log('[net360] API BASE:', API_BASE);

if (!API_BASE.startsWith('https') && import.meta.env.PROD) {
  console.warn('API is not using HTTPS in production');
}

const TOKEN_STORAGE_KEY = 'net360-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'net360-auth-refresh-token';
const ADMIN_TOKEN_STORAGE_KEY = 'net360-admin-access-token';
const ADMIN_REFRESH_TOKEN_STORAGE_KEY = 'net360-admin-refresh-token';
const DEFAULT_API_TIMEOUT_MS = 35_000;
const AI_PARSE_API_TIMEOUT_MS = 120_000;
const MAX_API_TIMEOUT_MS = 240_000;
const DEFAULT_API_RETRY_DELAY_MS = 1_250;
const MAX_API_RETRY_COUNT = 3;

const DEFAULT_RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REFRESH_FAILURE_BACKOFF_MS = 15_000;

let refreshInFlight: Promise<string | null> | null = null;
let refreshBlockedUntil = 0;

function isNativeCapacitorRuntime() {
  const runtime = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(runtime?.isNativePlatform?.());
}

function logApiConfigurationIssue(level: 'warn' | 'error', message: string, details: Record<string, unknown> = {}) {
  const payload = {
    ...details,
    apiBaseUrl: API_BASE || '(empty)',
    isNative: isNativeCapacitorRuntime(),
  };

  if (level === 'error') {
    console.error(message, payload);
    return;
  }

  console.warn(message, payload);
}

function isSecureNativeApiBaseUrl(apiBaseUrl: string) {
  if (!apiBaseUrl) return false;
  if (/^https:\/\//i.test(apiBaseUrl)) return true;
  // Allow local cleartext hosts for local debugging only.
  return /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|10\.0\.3\.2)(:\d+)?/i.test(apiBaseUrl);
}

export function buildUrl(path: string): string {
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) {
    return p;
  }
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

function resolveApiPath(path: string) {
  return buildUrl(path);
}

function resolveRequestTimeoutMs(path: string, explicitTimeoutMs?: number) {
  if (Number.isFinite(explicitTimeoutMs) && Number(explicitTimeoutMs) > 0) {
    return Math.min(MAX_API_TIMEOUT_MS, Math.max(1_000, Math.floor(Number(explicitTimeoutMs))));
  }
  if (String(path || '').includes('/api/ai/parse-mcqs')) {
    return AI_PARSE_API_TIMEOUT_MS;
  }
  return DEFAULT_API_TIMEOUT_MS;
}

function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.floor(ms)));
  });
}

function resolveRetryCount(explicitRetryCount?: number) {
  if (!Number.isFinite(explicitRetryCount)) return 0;
  return Math.max(0, Math.min(MAX_API_RETRY_COUNT, Math.floor(Number(explicitRetryCount))));
}

function resolveRetryDelayMs(explicitRetryDelayMs?: number) {
  if (!Number.isFinite(explicitRetryDelayMs) || Number(explicitRetryDelayMs) <= 0) {
    return DEFAULT_API_RETRY_DELAY_MS;
  }
  return Math.max(250, Math.min(15_000, Math.floor(Number(explicitRetryDelayMs))));
}

function shouldRetryTransportError(error: Error) {
  const code = String((error as Error & { code?: string }).code || '').toUpperCase();
  const message = String(error.message || '').toLowerCase();

  return code === 'REQUEST_TIMEOUT'
    || message.includes('network error')
    || message.includes('failed to fetch')
    || message.includes('backend offline')
    || message.includes('cors')
    || message.includes('timed out');
}

function shouldRetryHttpStatus(status: number, options: ApiRequestOptions) {
  if (!Number.isFinite(status) || status <= 0) return false;
  const customStatuses = Array.isArray(options.retryOnStatuses)
    ? options.retryOnStatuses.filter((item) => Number.isFinite(item)).map((item) => Number(item))
    : [];

  if (customStatuses.length > 0) {
    return customStatuses.includes(status);
  }

  return DEFAULT_RETRIABLE_STATUS_CODES.has(status);
}

function computeRetryDelayMs(attemptIndex: number, baseDelayMs: number, retryAfterSeconds?: number) {
  if (Number.isFinite(retryAfterSeconds) && Number(retryAfterSeconds) > 0) {
    return Math.max(baseDelayMs, Math.floor(Number(retryAfterSeconds) * 1000));
  }

  const exponential = baseDelayMs * (2 ** Math.max(0, attemptIndex));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(20_000, exponential + jitter);
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const externalSignal = init.signal;
  const controller = new AbortController();
  let didTimeout = false;

  const timeoutHandle = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timeoutHandle);
      throw new DOMException('Request aborted.', 'AbortError');
    }
    externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  try {
    return await fetch(input, {
      ...init,
      credentials: init.credentials || 'include',
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) {
      const timeoutError = new Error(`Request timed out after ${Math.ceil(timeoutMs / 1000)}s.`) as Error & { code?: string };
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutHandle);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternal);
    }
  }
}

function mapTransportError(path: string, resolvedUrl: string, error: unknown) {
  const asError = error instanceof Error ? error : new Error(String(error));
  const rawMessage = String(asError.message || '').trim();
  const normalized = rawMessage.toLowerCase();

  if ((asError as Error & { code?: string }).code === 'REQUEST_TIMEOUT') {
    return new Error(`Request timeout for ${resolvedUrl}. The server took too long to respond. Please try again.`);
  }

  if (normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed')) {
    return new Error(
      `Network error while calling ${resolvedUrl}. Check backend URL/port, CORS settings, confirm the API server is running, and ensure VITE_API_URL is set.`,
    );
  }

  if (normalized.includes('aborterror')) {
    return new Error(`Request to ${resolvedUrl} was cancelled before completion.`);
  }

  return asError;
}

export function buildApiUrl(path: string) {
  return buildUrl(path);
}

/** SSE: prefer httpOnly cookies (`withCredentials`); add `?token=` only when persisting bearer tokens (e.g. native). */
export function buildSseStreamUrl(authToken?: string | null): string {
  const base = buildApiUrl('/api/stream');
  const bearer = authToken && !isCookieSessionApiMarker(authToken) ? authToken : '';
  if (bearer && shouldPersistAuthTokens()) {
    return `${base}?token=${encodeURIComponent(bearer)}`;
  }
  return base;
}

function readStoredAccessToken() {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  if (adminToken) return adminToken;
  if (!shouldPersistAuthTokens()) return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/** True if an httpOnly cookie session is active (no bearer token required). */
export async function probeAuthenticatedSession(): Promise<boolean> {
  if (typeof window === 'undefined' || !hasStoredAuthCredentials()) return false;
  try {
    await apiRequest<{ user: unknown }>('/api/auth/me', { method: 'GET' });
    return true;
  } catch {
    return false;
  }
}

/** Token for opening exam windows / API calls: context token, LS refresh, or cookie session marker. */
export async function resolveLaunchAuthToken(contextToken: string | null | undefined): Promise<string | null> {
  if (contextToken) return contextToken;

  if (shouldPersistAuthTokens()) {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) return stored;

    const rt = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (rt) {
      try {
        const refreshed = await apiRequest<{ token?: string; refreshToken?: string; user?: unknown }>(
          '/api/auth/refresh',
          { method: 'POST', body: JSON.stringify({ refreshToken: rt }) },
        );
        if (refreshed.token) {
          persistStudentTokens(refreshed.token, refreshed.refreshToken ?? null);
          return refreshed.token;
        }
        if (refreshed.user) {
          return COOKIE_SESSION_API_MARKER;
        }
      } catch {
        // Fall through to cookie session probe.
      }
    }
  }

  if (!hasStoredAuthCredentials()) {
    return null;
  }

  try {
    await apiRequest<{ user: unknown }>('/api/auth/me', { method: 'GET' });
    return COOKIE_SESSION_API_MARKER;
  } catch {
    return null;
  }
}

function readStoredRefreshCandidates() {
  const seen = new Set<string>();
  const candidates: Array<{ key: string; value: string }> = [];
  const keys = [ADMIN_REFRESH_TOKEN_STORAGE_KEY];
  if (shouldPersistAuthTokens()) {
    keys.unshift(REFRESH_TOKEN_STORAGE_KEY);
  }
  keys.forEach((key) => {
    const value = localStorage.getItem(key);
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    candidates.push({ key, value });
  });
  return candidates;
}

function clearStoredTokenPair(refreshKey: string) {
  if (refreshKey === ADMIN_REFRESH_TOKEN_STORAGE_KEY) {
    localStorage.removeItem(ADMIN_REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return;
  }

  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.max(1, Math.floor(asNumber));
  }

  const asDate = new Date(headerValue).getTime();
  if (Number.isFinite(asDate)) {
    const seconds = Math.ceil((asDate - Date.now()) / 1000);
    return seconds > 0 ? seconds : undefined;
  }

  return undefined;
}

function isLikelyHtmlResponse(response: Response, bodyText: string) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return true;
  }
  return /^\s*</.test(bodyText);
}

function buildHtmlInsteadOfJsonError(path: string) {
  return new Error(
    `API configuration error: ${path} returned HTML instead of JSON. ` +
    'Set VITE_API_URL for Android builds.',
  );
}

function buildMissingNativeApiBaseUrlError(path: string) {
  return new Error(
    `API configuration error: ${path} is running in native mode without backend URL. ` +
    'Set VITE_API_URL for Android builds.',
  );
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}, token?: string | null): Promise<T> {
  const effectiveBaseUrl = API_BASE;
  const timeoutMs = resolveRequestTimeoutMs(path, options.timeoutMs);
  const retryCount = resolveRetryCount(options.retryCount);
  const retryDelayMs = resolveRetryDelayMs(options.retryDelayMs);
  const resolvedPath = resolveApiPath(path);

  if (
    isNativeCapacitorRuntime()
    && Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD)
    && effectiveBaseUrl
    && !isSecureNativeApiBaseUrl(effectiveBaseUrl)
  ) {
    const message =
      `API configuration error: ${path} is using an insecure mobile API URL (${effectiveBaseUrl}). ` +
      'Use an HTTPS backend URL for native production builds.';
    logApiConfigurationIssue('error', message, { path, phase: 'native-url-validation' });
    throw new Error(message);
  }

  if (isNativeCapacitorRuntime() && !effectiveBaseUrl && path.startsWith('/api/')) {
    logApiConfigurationIssue('error', 'Native API request attempted without configured backend URL.', {
      path,
      phase: 'missing-native-base-url',
    });
    throw buildMissingNativeApiBaseUrlError(path);
  }

  const buildHeaders = (authToken?: string | null) => {
    const headers = new Headers(options.headers || {});
    const hasBody = options.body != null;
    const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    if (!headers.has('Content-Type') && hasBody && !isFormDataBody) {
      headers.set('Content-Type', 'application/json');
    }
    if (authToken && !isCookieSessionApiMarker(authToken)) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    return headers;
  };

  const tryRefreshAccessToken = async () => {
    if (path.startsWith('/api/auth/refresh')) return null;

    if (Date.now() < refreshBlockedUntil) {
      return null;
    }

    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      const refreshCandidates = readStoredRefreshCandidates();
      const tryCookieRefresh = async () => {
        const response = await fetchWithTimeout(resolveApiPath('/api/auth/refresh'), {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({}),
        }, Math.min(timeoutMs, 20_000));

        if (!response.ok) {
          return null;
        }

        const payload = await response.json() as {
          token?: string;
          refreshToken?: string;
          user?: { role?: 'admin' | 'student' };
        };

        const role = String(payload?.user?.role || '').toLowerCase();
        if (role === 'admin') {
          if (payload?.token) {
            localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, payload.token);
            if (payload.refreshToken) {
              localStorage.setItem(ADMIN_REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
            }
            return payload.token;
          }
          return COOKIE_SESSION_API_MARKER;
        }

        if (payload?.token && shouldPersistAuthTokens()) {
          localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
          if (payload.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
          }
          return payload.token;
        }

        return COOKIE_SESSION_API_MARKER;
      };

      if (!refreshCandidates.length) {
        try {
          const cookieToken = await tryCookieRefresh();
          if (cookieToken) {
            refreshBlockedUntil = 0;
            return cookieToken;
          }
        } catch {
          // Fall through to backoff assignment.
        }

        refreshBlockedUntil = Date.now() + REFRESH_FAILURE_BACKOFF_MS;
        return null;
      }

      for (const candidate of refreshCandidates) {
        try {
          const response = await fetchWithTimeout(resolveApiPath('/api/auth/refresh'), {
            method: 'POST',
            headers: new Headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ refreshToken: candidate.value }),
          }, Math.min(timeoutMs, 20_000));

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              // Remove revoked/expired refresh tokens to avoid repeating known-bad attempts.
              clearStoredTokenPair(candidate.key);
            }
            continue;
          }

          let payload: { token?: string; refreshToken?: string; user?: { role?: string } };
          try {
            payload = await response.json() as { token?: string; refreshToken?: string; user?: { role?: string } };
          } catch {
            const bodyText = await response.text().catch(() => '');
            if (isLikelyHtmlResponse(response, bodyText)) {
              throw buildHtmlInsteadOfJsonError('/api/auth/refresh');
            }
            continue;
          }

          if (candidate.key === ADMIN_REFRESH_TOKEN_STORAGE_KEY) {
            if (!payload?.token) continue;
            localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, payload.token);
            if (payload.refreshToken) {
              localStorage.setItem(ADMIN_REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
            }
            refreshBlockedUntil = 0;
            return payload.token;
          }

          if (payload?.token && shouldPersistAuthTokens()) {
            localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
            if (payload.refreshToken) {
              localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
            }
            refreshBlockedUntil = 0;
            return payload.token;
          }

          if (!shouldPersistAuthTokens()) {
            refreshBlockedUntil = 0;
            return COOKIE_SESSION_API_MARKER;
          }

          continue;
        } catch {
          // Try next refresh token candidate.
        }
      }

      try {
        const cookieToken = await tryCookieRefresh();
        if (cookieToken) {
          refreshBlockedUntil = 0;
          return cookieToken;
        }
      } catch {
        // Continue to backoff and return null.
      }

      refreshBlockedUntil = Date.now() + REFRESH_FAILURE_BACKOFF_MS;
      return null;
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  };

  const explicitToken = token && String(token).trim() ? token : null;
  const initialToken = explicitToken || readStoredAccessToken();

  let response: Response;
  let attempt = 0;
  // Retry transient transport/HTTP failures to absorb slow backend wake-ups.
  for (;;) {
    try {
      response = await fetchWithTimeout(resolvedPath, {
        ...options,
        headers: buildHeaders(initialToken),
      }, timeoutMs);
    } catch (error) {
      const mappedError = mapTransportError(path, resolvedPath, error);
      if (attempt < retryCount && shouldRetryTransportError(mappedError)) {
        const retryDelay = computeRetryDelayMs(attempt, retryDelayMs);
        attempt += 1;
        await delayMs(retryDelay);
        continue;
      }

      logApiConfigurationIssue('error', 'API request failed.', {
        path,
        error: mappedError.message,
        phase: 'network-failure',
      });
      throw mappedError;
    }

    if (!response.ok && attempt < retryCount && shouldRetryHttpStatus(response.status, options)) {
      const retryDelay = computeRetryDelayMs(
        attempt,
        retryDelayMs,
        parseRetryAfterSeconds(response.headers.get('Retry-After')),
      );
      attempt += 1;
      await delayMs(retryDelay);
      continue;
    }

    break;
  }

  if (!response.ok) {
    if (response.status === 401) {
      const refreshedToken = await tryRefreshAccessToken();
      if (refreshedToken) {
        const retryResponse = await fetchWithTimeout(resolvedPath, {
          ...options,
          headers: buildHeaders(refreshedToken),
        }, timeoutMs);

        if (retryResponse.ok) {
          try {
            return await retryResponse.json() as T;
          } catch {
            const bodyText = await retryResponse.text().catch(() => '');
            if (isLikelyHtmlResponse(retryResponse, bodyText)) {
              throw buildHtmlInsteadOfJsonError(path);
            }
            throw new Error(`Unexpected API response format for ${path}. Expected JSON.`);
          }
        }

        response = retryResponse;
      }
    }

    let errorMessage = `Request failed (${response.status})`;
    let payload: any = null;
    try {
      payload = await response.json();
      errorMessage = payload?.error || errorMessage;
    } catch {
      const bodyText = await response.text().catch(() => '');
      if (isLikelyHtmlResponse(response, bodyText)) {
        errorMessage = buildHtmlInsteadOfJsonError(path).message;
      }
    }

    if (response.status === 413 && errorMessage === `Request failed (${response.status})`) {
      errorMessage = 'Uploaded file is too large. Upload a JPG, PNG, or PDF up to 5MB.';
    }

    if (
      response.status === 404
      && path.startsWith('/api/')
      && env.VITE_ADMIN_ONLY === 'true'
      && errorMessage === `Request failed (${response.status})`
    ) {
      errorMessage = 'Admin portal API is not configured. Set VITE_API_URL to your backend service URL and redeploy.';
    }

    const error = new Error(errorMessage) as Error & {
      status?: number;
      code?: string;
      payload?: any;
      activeSession?: any;
      retryAfterSeconds?: number;
    };
    error.status = response.status;
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
    if (retryAfterSeconds) {
      error.retryAfterSeconds = retryAfterSeconds;
    }
    if (payload && typeof payload === 'object') {
      if (typeof payload.code === 'string') {
        error.code = payload.code;
      }
      if (payload.activeSession) {
        error.activeSession = payload.activeSession;
      }
      error.payload = payload;
    }

    throw error;
  }

  try {
    return await response.json() as T;
  } catch {
    const bodyText = await response.text().catch(() => '');
    const looksHtml = isLikelyHtmlResponse(response, bodyText);

    if (looksHtml) {
      throw buildHtmlInsteadOfJsonError(path);
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    throw new Error(
      `Unexpected API response format for ${path}. Expected JSON but received ${contentType || 'unknown content type'}.`,
    );
  }
}

export async function downloadReport(path: string, token?: string | null): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  if (token && !isCookieSessionApiMarker(token)) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    const requestUrl = resolveApiPath(path);
    response = await fetch(requestUrl, {
      headers,
      credentials: 'include',
    });
  } catch {
    throw new Error('Unable to reach report service. Check network and VITE_API_URL.');
  }

  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const contentType = response.headers.get('Content-Type') || '';
  const defaultReportName = 'NET360_Performance_Report.pdf';
  const filename = match?.[1] || (contentType.includes('pdf') || /format=pdf/i.test(path) ? defaultReportName : 'report.bin');
  const blob = await response.blob();

  return { blob, filename };
}

export async function downloadBinary(path: string, options: RequestInit = {}, token?: string | null): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body != null;
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!headers.has('Content-Type') && hasBody && !isFormDataBody) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !isCookieSessionApiMarker(token)) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const requestUrl = resolveApiPath(path);
  const response = await fetch(requestUrl, {
    ...options,
    headers,
    credentials: options.credentials || 'include',
  });

  if (!response.ok) {
    let errorMessage = `Export failed (${response.status})`;
    try {
      const payload = await response.json();
      errorMessage = payload?.error || errorMessage;
    } catch {
      // Keep fallback export error.
    }
    throw new Error(errorMessage);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || 'document.dat';
  const blob = await response.blob();
  return { blob, filename };
}

/**
 * Production often uses httpOnly cookies only (no JWT in localStorage). Mobile Safari and some
 * cross-origin API setups omit cookies on POST fetch; Authorization: Bearer works reliably.
 * Call POST /api/auth/refresh to obtain JWTs in the JSON body (requires ISSUE_AUTH_BODY_TOKENS on server)
 * and persist them before sensitive POSTs like /api/tests/start.
 */
export async function ensureStudentBearerTokenFromRefresh(
  contextToken: string | null | undefined,
): Promise<void> {
  const stored = readStoredAccessToken();
  if (stored && !isCookieSessionApiMarker(stored)) return;

  try {
    const out = await apiRequest<{ token?: string; refreshToken?: string }>(
      '/api/auth/refresh',
      { method: 'POST', body: JSON.stringify({}) },
      contextToken ?? undefined,
    );
    if (out?.token && shouldPersistAuthTokens()) {
      persistStudentTokens(out.token, out.refreshToken ?? null);
    }
  } catch {
    // Cookie-only same-origin sessions may still succeed without a bearer.
  }
}

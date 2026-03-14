import { localApiRequest, localDownloadReport } from './localApi';

type RuntimeEnv = {
  VITE_API_BASE_URL?: string;
  VITE_MOBILE_API_BASE_URL?: string;
  VITE_FORCE_LOCAL_API?: string;
  VITE_DISABLE_LOCAL_API_FALLBACK?: string;
  VITE_ADMIN_ONLY?: string;
};

const env = ((import.meta as ImportMeta & { env?: RuntimeEnv }).env || {}) as RuntimeEnv;
const API_BASE_URL = env.VITE_API_BASE_URL || '';
const MOBILE_API_BASE_URL = env.VITE_MOBILE_API_BASE_URL || '';
const TOKEN_STORAGE_KEY = 'net360-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'net360-auth-refresh-token';
const ADMIN_TOKEN_STORAGE_KEY = 'net360-admin-access-token';
const ADMIN_REFRESH_TOKEN_STORAGE_KEY = 'net360-admin-refresh-token';

function isNativeCapacitorRuntime() {
  const runtime = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(runtime?.isNativePlatform?.());
}

function getEffectiveApiBaseUrl() {
  // Native Android should call a real backend URL to keep data in sync.
  if (isNativeCapacitorRuntime()) {
    return MOBILE_API_BASE_URL || API_BASE_URL;
  }
  return API_BASE_URL;
}

function canFallbackToLocalMode() {
  if (env.VITE_FORCE_LOCAL_API === 'true') {
    return true;
  }
  // Keep native builds aligned with backend data by default.
  // Developers can still opt in via VITE_FORCE_LOCAL_API=true.
  if (isNativeCapacitorRuntime()) {
    return false;
  }
  return env.VITE_DISABLE_LOCAL_API_FALLBACK !== 'true';
}

function resolveApiPath(path: string) {
  const effectiveBaseUrl = getEffectiveApiBaseUrl();
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!effectiveBaseUrl) {
    return path;
  }
  return `${effectiveBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildApiUrl(path: string) {
  return resolveApiPath(path);
}

function shouldUseForcedLocalMode() {
  return env.VITE_FORCE_LOCAL_API === 'true' && canFallbackToLocalMode();
}

function readStoredAccessToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

function readStoredRefreshCandidates() {
  const seen = new Set<string>();
  const candidates: Array<{ key: string; value: string }> = [];
  [REFRESH_TOKEN_STORAGE_KEY, ADMIN_REFRESH_TOKEN_STORAGE_KEY].forEach((key) => {
    const value = localStorage.getItem(key);
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    candidates.push({ key, value });
  });
  return candidates;
}

function isPremiumSensitivePath(path: string) {
  return path.startsWith('/api/subscriptions/') || path.startsWith('/api/ai/');
}

function isAdminSensitivePath(path: string) {
  return path.startsWith('/api/admin/') || path.startsWith('/api/stream');
}

function shouldFallbackFromHttpError(path: string, status: number, hasAuthToken: boolean) {
  if (!canFallbackToLocalMode()) {
    return false;
  }

  // Do not switch premium/subscription endpoints to local mode when authenticated.
  // Mixing remote auth with local subscription state can incorrectly re-lock premium features.
  if (hasAuthToken && (isPremiumSensitivePath(path) || isAdminSensitivePath(path))) {
    return false;
  }

  const effectiveBaseUrl = getEffectiveApiBaseUrl();

  // 5xx usually means upstream/proxy/backend is unavailable.
  if (status >= 500) {
    return true;
  }

  // If no explicit backend URL is configured, /api 404 indicates frontend-only hosting.
  if (!effectiveBaseUrl && status === 404 && path.startsWith('/api/')) {
    return true;
  }

  return false;
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
    'Check VITE_API_BASE_URL / VITE_MOBILE_API_BASE_URL and ensure it points to the backend API service.',
  );
}

function buildMissingNativeApiBaseUrlError(path: string) {
  return new Error(
    `API configuration error: ${path} is running in native mode without backend URL. ` +
    'Set VITE_API_BASE_URL or VITE_MOBILE_API_BASE_URL for Android builds.',
  );
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  if (
    isNativeCapacitorRuntime()
    && !getEffectiveApiBaseUrl()
    && path.startsWith('/api/')
    && env.VITE_FORCE_LOCAL_API !== 'true'
  ) {
    throw buildMissingNativeApiBaseUrlError(path);
  }

  if (shouldUseForcedLocalMode() && isPremiumSensitivePath(path)) {
    throw new Error('AI mentor features require live backend mode. Disable VITE_FORCE_LOCAL_API and configure VITE_API_BASE_URL.');
  }

  if (shouldUseForcedLocalMode()) {
    return localApiRequest<T>(path, options, token);
  }

  const buildHeaders = (authToken?: string | null) => {
    const headers = new Headers(options.headers || {});
    const hasBody = options.body != null;
    const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!headers.has('Content-Type') && hasBody && !isFormDataBody) {
      headers.set('Content-Type', 'application/json');
    }
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    return headers;
  };

  const tryRefreshAccessToken = async () => {
    if (path.startsWith('/api/auth/refresh')) return null;
    const refreshCandidates = readStoredRefreshCandidates();
    if (!refreshCandidates.length) return null;

    for (const candidate of refreshCandidates) {
      try {
        const response = await fetch(resolveApiPath('/api/auth/refresh'), {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ refreshToken: candidate.value }),
        });
        if (!response.ok) continue;

        let payload: { token?: string; refreshToken?: string };
        try {
          payload = await response.json() as { token?: string; refreshToken?: string };
        } catch {
          const bodyText = await response.text().catch(() => '');
          if (isLikelyHtmlResponse(response, bodyText)) {
            throw buildHtmlInsteadOfJsonError('/api/auth/refresh');
          }
          continue;
        }
        if (!payload?.token) continue;

        if (candidate.key === ADMIN_REFRESH_TOKEN_STORAGE_KEY) {
          localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, payload.token);
          if (payload.refreshToken) {
            localStorage.setItem(ADMIN_REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
          }
        } else {
          localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
          if (payload.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
          }
        }

        return payload.token;
      } catch {
        // Try next refresh token candidate.
      }
    }

    return null;
  };

  const initialToken = token || readStoredAccessToken();
  const hasAuthToken = Boolean(initialToken);

  let response: Response;
  try {
    response = await fetch(resolveApiPath(path), {
      ...options,
      headers: buildHeaders(initialToken),
    });
  } catch (error) {
    // If backend is unreachable, transparently fall back to browser-local mode.
    if (canFallbackToLocalMode() && !(hasAuthToken && (isPremiumSensitivePath(path) || isAdminSensitivePath(path)))) {
      return localApiRequest<T>(path, options, token);
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 401) {
      const refreshedToken = await tryRefreshAccessToken();
      if (refreshedToken) {
        const retryResponse = await fetch(resolveApiPath(path), {
          ...options,
          headers: buildHeaders(refreshedToken),
        });

        if (retryResponse.ok) {
          try {
            return await retryResponse.json() as T;
          } catch {
            const bodyText = await retryResponse.text().catch(() => '');
            if (isLikelyHtmlResponse(retryResponse, bodyText)) {
              if (canFallbackToLocalMode() && !(hasAuthToken && (isPremiumSensitivePath(path) || isAdminSensitivePath(path)))) {
                return localApiRequest<T>(path, options, token);
              }
              throw buildHtmlInsteadOfJsonError(path);
            }
            throw new Error(`Unexpected API response format for ${path}. Expected JSON.`);
          }
        }

        response = retryResponse;
      }
    }

    if (shouldFallbackFromHttpError(path, response.status, hasAuthToken)) {
      return localApiRequest<T>(path, options, token);
    }

    let errorMessage = `Request failed (${response.status})`;
    let payload: any = null;
    try {
      payload = await response.json();
      errorMessage = payload?.error || errorMessage;
    } catch {
      // Keep fallback message.
    }

    if (response.status === 413 && errorMessage === `Request failed (${response.status})`) {
      errorMessage = 'Uploaded file is too large. Upload a JPG, PNG, or PDF up to 5MB.';
    }

    if (
      response.status === 404
      && path.startsWith('/api/')
      && !getEffectiveApiBaseUrl()
      && env.VITE_ADMIN_ONLY === 'true'
      && errorMessage === `Request failed (${response.status})`
    ) {
      errorMessage = 'Admin portal API is not configured. Set VITE_API_BASE_URL to your backend service URL and redeploy.';
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

    if (looksHtml && canFallbackToLocalMode() && !(hasAuthToken && (isPremiumSensitivePath(path) || isAdminSensitivePath(path)))) {
      return localApiRequest<T>(path, options, token);
    }

    if (looksHtml) {
      throw buildHtmlInsteadOfJsonError(path);
    }

    throw new Error(`Unexpected API response format for ${path}. Expected JSON.`);
  }
}

export async function downloadReport(path: string, token?: string | null): Promise<{ blob: Blob; filename: string }> {
  if (shouldUseForcedLocalMode()) {
    const url = new URL(path, window.location.origin);
    const format = (url.searchParams.get('format') || 'pdf') as 'pdf';
    return localDownloadReport(format, token);
  }

  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const hasAuthToken = Boolean(token || readStoredAccessToken());

  let response: Response;
  try {
    response = await fetch(resolveApiPath(path), { headers });
  } catch {
    if (!canFallbackToLocalMode()) {
      throw new Error('Unable to reach report service. Check mobile network and API base URL configuration.');
    }
    const url = new URL(path, window.location.origin);
    const format = (url.searchParams.get('format') || 'pdf') as 'pdf';
    return localDownloadReport(format, token);
  }

  if (!response.ok && shouldFallbackFromHttpError(path, response.status, hasAuthToken)) {
    const url = new URL(path, window.location.origin);
    const format = (url.searchParams.get('format') || 'pdf') as 'pdf';
    return localDownloadReport(format, token);
  }

  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match?.[1] || 'report.dat';
  const blob = await response.blob();

  return { blob, filename };
}

export async function downloadBinary(path: string, options: RequestInit = {}, token?: string | null): Promise<{ blob: Blob; filename: string }> {
  if (shouldUseForcedLocalMode() && isPremiumSensitivePath(path)) {
    throw new Error('AI mentor export requires live backend mode. Disable VITE_FORCE_LOCAL_API and configure VITE_API_BASE_URL.');
  }

  if (shouldUseForcedLocalMode()) {
    throw new Error('Export is unavailable in forced local mode. Connect to the API backend and try again.');
  }

  const headers = new Headers(options.headers || {});
  const hasBody = options.body != null;
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!headers.has('Content-Type') && hasBody && !isFormDataBody) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiPath(path), {
    ...options,
    headers,
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

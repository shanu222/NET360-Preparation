import { localApiRequest, localDownloadReport } from './localApi';

type RuntimeEnv = {
  VITE_API_BASE_URL?: string;
  VITE_MOBILE_API_BASE_URL?: string;
  VITE_FORCE_LOCAL_API?: string;
  VITE_DISABLE_LOCAL_API_FALLBACK?: string;
};

const env = ((import.meta as ImportMeta & { env?: RuntimeEnv }).env || {}) as RuntimeEnv;
const API_BASE_URL = env.VITE_API_BASE_URL || '';
const MOBILE_API_BASE_URL = env.VITE_MOBILE_API_BASE_URL || '';
const TOKEN_STORAGE_KEY = 'net360-auth-token';
const REFRESH_TOKEN_STORAGE_KEY = 'net360-auth-refresh-token';

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
  if (env.VITE_DISABLE_LOCAL_API_FALLBACK === 'true') {
    return false;
  }
  return !isNativeCapacitorRuntime();
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

function shouldUseForcedLocalMode() {
  return env.VITE_FORCE_LOCAL_API === 'true' && canFallbackToLocalMode();
}

function isPremiumSensitivePath(path: string) {
  return path.startsWith('/api/subscriptions/') || path.startsWith('/api/ai/');
}

function shouldFallbackFromHttpError(path: string, status: number, hasAuthToken: boolean) {
  if (!canFallbackToLocalMode()) {
    return false;
  }

  // Do not switch premium/subscription endpoints to local mode when authenticated.
  // Mixing remote auth with local subscription state can incorrectly re-lock premium features.
  if (hasAuthToken && isPremiumSensitivePath(path)) {
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

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  if (shouldUseForcedLocalMode()) {
    return localApiRequest<T>(path, options, token);
  }

  if (isNativeCapacitorRuntime() && !getEffectiveApiBaseUrl() && path.startsWith('/api/')) {
    throw new Error('Mobile API is not configured. Set VITE_API_BASE_URL or VITE_MOBILE_API_BASE_URL before building Android app.');
  }

  const buildHeaders = (authToken?: string | null) => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    return headers;
  };

  const tryRefreshAccessToken = async () => {
    if (path.startsWith('/api/auth/refresh')) return null;
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (!refreshToken) return null;

    try {
      const response = await fetch(resolveApiPath('/api/auth/refresh'), {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;

      const payload = await response.json() as { token?: string; refreshToken?: string };
      if (!payload?.token) return null;

      localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
      if (payload.refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
      }

      return payload.token;
    } catch {
      return null;
    }
  };

  const initialToken = token || localStorage.getItem(TOKEN_STORAGE_KEY);
  const hasAuthToken = Boolean(initialToken);

  let response: Response;
  try {
    response = await fetch(resolveApiPath(path), {
      ...options,
      headers: buildHeaders(initialToken),
    });
  } catch (error) {
    // If backend is unreachable, transparently fall back to browser-local mode.
    if (canFallbackToLocalMode() && !(hasAuthToken && isPremiumSensitivePath(path))) {
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
          return retryResponse.json() as Promise<T>;
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

  return response.json() as Promise<T>;
}

export async function downloadReport(path: string, token?: string | null): Promise<{ blob: Blob; filename: string }> {
  if (shouldUseForcedLocalMode()) {
    const url = new URL(path, window.location.origin);
    const format = (url.searchParams.get('format') || 'pdf') as 'pdf';
    return localDownloadReport(format, token);
  }

  if (isNativeCapacitorRuntime() && !getEffectiveApiBaseUrl() && path.startsWith('/api/')) {
    throw new Error('Mobile API is not configured. Set VITE_API_BASE_URL or VITE_MOBILE_API_BASE_URL before building Android app.');
  }

  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const hasAuthToken = Boolean(token || localStorage.getItem(TOKEN_STORAGE_KEY));

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

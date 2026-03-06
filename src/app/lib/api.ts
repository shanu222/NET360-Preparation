import { localApiRequest, localDownloadReport } from './localApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function resolveApiPath(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!API_BASE_URL) {
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function shouldUseForcedLocalMode() {
  return import.meta.env.VITE_FORCE_LOCAL_API === 'true';
}

function shouldFallbackFromHttpError(path: string, status: number) {
  // 5xx usually means upstream/proxy/backend is unavailable.
  if (status >= 500) {
    return true;
  }

  // If no explicit backend URL is configured, /api 404 indicates frontend-only hosting.
  if (!API_BASE_URL && status === 404 && path.startsWith('/api/')) {
    return true;
  }

  return false;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  if (shouldUseForcedLocalMode()) {
    return localApiRequest<T>(path, options, token);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveApiPath(path), {
      ...options,
      headers,
    });
  } catch (error) {
    // If backend is unreachable, transparently fall back to browser-local mode.
    return localApiRequest<T>(path, options, token);
  }

  if (!response.ok) {
    if (shouldFallbackFromHttpError(path, response.status)) {
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

    const error = new Error(errorMessage) as Error & {
      status?: number;
      code?: string;
      payload?: any;
      activeSession?: any;
    };
    error.status = response.status;
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
    const format = (url.searchParams.get('format') || 'json') as 'csv' | 'json';
    return localDownloadReport(format, token);
  }

  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveApiPath(path), { headers });
  } catch {
    const url = new URL(path, window.location.origin);
    const format = (url.searchParams.get('format') || 'json') as 'csv' | 'json';
    return localDownloadReport(format, token);
  }

  if (!response.ok && shouldFallbackFromHttpError(path, response.status)) {
    const url = new URL(path, window.location.origin);
    const format = (url.searchParams.get('format') || 'json') as 'csv' | 'json';
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

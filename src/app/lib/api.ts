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
    let errorMessage = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      errorMessage = payload?.error || errorMessage;
    } catch {
      // Keep fallback message.
    }
    throw new Error(errorMessage);
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
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match?.[1] || 'report.dat';
  const blob = await response.blob();

  return { blob, filename };
}

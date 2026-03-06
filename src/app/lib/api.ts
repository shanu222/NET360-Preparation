export function resolveApiUrl(path: string) {
  const base = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').trim();
  if (!base) return path;

  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    let payload: any = null;
    try {
      payload = await response.json();
      errorMessage = payload?.error || errorMessage;
    } catch {
      // Keep fallback message.
    }
    const error = new Error(errorMessage) as Error & Record<string, any>;
    error.status = response.status;
    if (payload && typeof payload === 'object') {
      Object.assign(error, payload);
    }
    throw error;
  }

  return response.json() as Promise<T>;
}

export async function downloadReport(path: string, token?: string | null): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(path), { headers, credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match?.[1] || 'report.dat';
  const blob = await response.blob();

  return { blob, filename };
}

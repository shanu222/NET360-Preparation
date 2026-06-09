const AUTH_DEBUG_ROUTES = new Set([
  '/api/subscriptions/me',
  '/api/mcqs/counts',
  '/api/tests/attempts',
]);

export function normalizeAuthDebugRoute(req) {
  return String(req?.originalUrl || req?.path || '').split('?')[0] || '';
}

export function shouldAuthDebugRoute(req) {
  const route = normalizeAuthDebugRoute(req);
  if (AUTH_DEBUG_ROUTES.has(route)) return true;
  return String(process.env.NET360_AUTH_DEBUG || '').trim() === '1';
}

export function logAuthDebug(req, details = {}) {
  if (!shouldAuthDebugRoute(req)) return;
  const payload = {
    tag: 'auth-debug',
    route: normalizeAuthDebugRoute(req),
    method: String(req?.method || 'GET').toUpperCase(),
    ...details,
  };
  console.log(JSON.stringify(payload));
}

export function authDeviceFingerprint(deviceId) {
  const raw = String(deviceId || '').trim();
  if (!raw) return '';
  return raw.length <= 12 ? raw : `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}

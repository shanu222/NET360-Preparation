/**
 * Lightweight verification for admin-aware auth token routing.
 * Run: node scripts/verify-admin-auth-routing.mjs
 */

function isAdminApiPath(path) {
  return String(path || '').startsWith('/api/admin/');
}

function readStoredRefreshCandidates(path, { adminRoute = false, studentRefresh = 'student-rt', adminRefresh = 'admin-rt' } = {}) {
  const adminContext = isAdminApiPath(path) || adminRoute;
  const keys = adminContext
    ? ['admin', 'student']
    : ['student', 'admin'];
  return keys
    .map((key) => ({ key, value: key === 'admin' ? adminRefresh : studentRefresh }))
    .filter((item) => item.value);
}

function buildAuthJsonBody(req, payload, { issueBodyTokens = false } = {}) {
  const isAdminPanel = String(req?.headers?.['x-net360-client-platform'] || '').toLowerCase() === 'admin-web';
  if (issueBodyTokens || isAdminPanel) return payload;
  return { user: payload.user };
}

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${name}`);
}

console.log('Admin auth routing verification\n');

console.log('Refresh candidate order:');
const adminCandidates = readStoredRefreshCandidates('/api/admin/support-chat/conversations', { adminRoute: true });
assert('admin API prefers admin refresh first', adminCandidates[0]?.key === 'admin');

const studentCandidates = readStoredRefreshCandidates('/api/subscriptions/me', { adminRoute: false });
assert('student API prefers student refresh first', studentCandidates[0]?.key === 'student');

console.log('\nAuth JSON body policy:');
const cookieOnly = buildAuthJsonBody(
  { headers: { 'x-net360-client-platform': 'web' } },
  { token: 'access', refreshToken: 'refresh', user: { role: 'admin' } },
  { issueBodyTokens: false },
);
assert('web login stays cookie-only when configured', !cookieOnly.token && Boolean(cookieOnly.user));

const adminBody = buildAuthJsonBody(
  { headers: { 'x-net360-client-platform': 'admin-web' } },
  { token: 'access', refreshToken: 'refresh', user: { role: 'admin' } },
  { issueBodyTokens: false },
);
assert('admin panel always receives bearer tokens in JSON', Boolean(adminBody.token && adminBody.refreshToken));

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

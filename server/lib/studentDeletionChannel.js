export function normalizeAuthProviderDetail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'google.com' || normalized === 'google') return 'google';
  if (normalized === 'password' || normalized === 'firebase' || normalized === 'local') {
    return normalized === 'firebase' ? 'password' : normalized;
  }
  return normalized || 'unknown';
}

export function isGoogleManagedAuthProvider(authProvider, authProviderDetail) {
  const p = String(authProvider || 'local').trim().toLowerCase();
  const d = normalizeAuthProviderDetail(authProviderDetail);
  return p === 'google' || d === 'google';
}

export function isPasswordManagedAuthProvider(authProvider, authProviderDetail) {
  const p = String(authProvider || 'local').trim().toLowerCase();
  const d = normalizeAuthProviderDetail(authProviderDetail);
  return p === 'local' || p === 'password' || d === 'password' || d === 'local';
}

export function classifyStudentDeletionChannelSync(user) {
  const provider = String(user?.authProvider || 'local').trim().toLowerCase();
  const detail = normalizeAuthProviderDetail(user?.authProviderDetail);
  if (isGoogleManagedAuthProvider(provider, detail)) return 'email-link';
  if (isPasswordManagedAuthProvider(provider, detail)) return 'password';
  return 'password';
}

export async function resolveStudentDeletionChannel(user, firebaseAdminAuth) {
  const provider = String(user?.authProvider || 'local').trim().toLowerCase();
  const detail = normalizeAuthProviderDetail(user?.authProviderDetail);
  if (isGoogleManagedAuthProvider(provider, detail)) {
    return 'email-link';
  }
  if (isPasswordManagedAuthProvider(provider, detail)) {
    return 'password';
  }
  const firebaseUid = String(user?.firebaseUid || '').trim();
  if (firebaseAdminAuth && firebaseUid) {
    try {
      const fbUser = await firebaseAdminAuth.getUser(firebaseUid);
      const ids = (fbUser.providerData || []).map((item) => String(item.providerId || '').toLowerCase());
      if (ids.includes('password')) return 'password';
      if (ids.includes('google.com')) return 'email-link';
    } catch (error) {
      console.warn('[auth] deletion channel firebase lookup failed', error?.message || error);
    }
  }
  return 'password';
}

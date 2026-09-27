import crypto from 'node:crypto';
import { isGoogleManagedAuthProvider, normalizeAuthProviderDetail } from './studentDeletionChannel.js';

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_VERIFY_SEND_WINDOW_MS = 60 * 60 * 1000;
export const EMAIL_VERIFY_MAX_SENDS_PER_WINDOW = 5;

export function isGoogleSignInProvider(signInProvider) {
  return normalizeAuthProviderDetail(signInProvider) === 'google';
}

/** True only for new email/password accounts that still owe a verification click. Existing and Google accounts stay open. */
export function accountNeedsEmailVerification(user) {
  if (!user) return false;
  if (String(user.role || 'student') === 'admin') return false;
  if (user.emailVerifiedAt) return false;
  if (user.requiresEmailVerification !== true) return false;
  if (isGoogleManagedAuthProvider(user.authProvider, user.authProviderDetail)) return false;
  return true;
}

export function generateEmailVerifyRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function evaluateVerificationSendLimit(user, now = Date.now()) {
  const lastSent = user?.emailVerifyLastSentAt ? new Date(user.emailVerifyLastSentAt).getTime() : 0;
  if (lastSent && Number.isFinite(lastSent) && now - lastSent < EMAIL_VERIFY_RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: Math.max(1, Math.ceil((EMAIL_VERIFY_RESEND_COOLDOWN_MS - (now - lastSent)) / 1000)),
    };
  }

  const windowStarted = user?.emailVerifySendWindowStartedAt
    ? new Date(user.emailVerifySendWindowStartedAt).getTime()
    : 0;
  const count = Number(user?.emailVerifySendCount || 0);
  const windowActive = Boolean(windowStarted) && Number.isFinite(windowStarted) && now - windowStarted < EMAIL_VERIFY_SEND_WINDOW_MS;
  if (windowActive && count >= EMAIL_VERIFY_MAX_SENDS_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'hourly_limit',
      retryAfterSeconds: Math.max(1, Math.ceil((EMAIL_VERIFY_SEND_WINDOW_MS - (now - windowStarted)) / 1000)),
    };
  }

  return { allowed: true, reason: '', retryAfterSeconds: 0 };
}

export function applyVerificationTokenToUser(user, rawToken, hashFn, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const windowStarted = user.emailVerifySendWindowStartedAt
    ? new Date(user.emailVerifySendWindowStartedAt).getTime()
    : 0;
  const windowActive = Boolean(windowStarted) && Number.isFinite(windowStarted) && nowMs - windowStarted < EMAIL_VERIFY_SEND_WINDOW_MS;

  user.emailVerifyTokenHash = hashFn(String(rawToken || ''));
  user.emailVerifyExpiresAt = new Date(nowMs + EMAIL_VERIFY_TTL_MS);
  user.emailVerifyLastSentAt = now instanceof Date ? now : new Date(nowMs);
  if (windowActive) {
    user.emailVerifySendCount = Number(user.emailVerifySendCount || 0) + 1;
  } else {
    user.emailVerifySendWindowStartedAt = user.emailVerifyLastSentAt;
    user.emailVerifySendCount = 1;
  }
}

export function clearEmailVerificationToken(user) {
  user.emailVerifyTokenHash = null;
  user.emailVerifyExpiresAt = null;
}

export function markEmailVerified(user, now = new Date()) {
  user.requiresEmailVerification = false;
  user.emailVerifiedAt = now instanceof Date ? now : new Date(now);
  clearEmailVerificationToken(user);
}

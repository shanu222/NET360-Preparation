import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMAIL_VERIFY_MAX_SENDS_PER_WINDOW,
  EMAIL_VERIFY_RESEND_COOLDOWN_MS,
  EMAIL_VERIFY_SEND_WINDOW_MS,
  EMAIL_VERIFY_TTL_MS,
  accountNeedsEmailVerification,
  applyVerificationTokenToUser,
  evaluateVerificationSendLimit,
  generateEmailVerifyRawToken,
  isGoogleSignInProvider,
  markEmailVerified,
} from './emailVerification.js';

test('Google sign-in providers skip email verification', () => {
  assert.equal(isGoogleSignInProvider('google.com'), true);
  assert.equal(isGoogleSignInProvider('google'), true);
  assert.equal(isGoogleSignInProvider('password'), false);
  assert.equal(isGoogleSignInProvider('firebase'), false);
});

test('existing accounts and Google accounts do not need verification', () => {
  assert.equal(accountNeedsEmailVerification({ role: 'student' }), false);
  assert.equal(accountNeedsEmailVerification({ requiresEmailVerification: false }), false);
  assert.equal(accountNeedsEmailVerification({
    requiresEmailVerification: true,
    emailVerifiedAt: new Date(),
  }), false);
  assert.equal(accountNeedsEmailVerification({
    requiresEmailVerification: true,
    authProvider: 'firebase',
    authProviderDetail: 'google.com',
  }), false);
  assert.equal(accountNeedsEmailVerification({
    requiresEmailVerification: true,
    role: 'admin',
  }), false);
});

test('new email/password accounts stay restricted until verified', () => {
  assert.equal(accountNeedsEmailVerification({
    role: 'student',
    requiresEmailVerification: true,
    authProvider: 'firebase',
    authProviderDetail: 'password',
  }), true);
});

test('verification tokens rotate and expire after 24 hours', () => {
  const user = {};
  const now = new Date('2026-09-27T12:00:00.000Z');
  applyVerificationTokenToUser(user, 'token-a', (value) => `hash:${value}`, now);
  assert.equal(user.emailVerifyTokenHash, 'hash:token-a');
  assert.equal(new Date(user.emailVerifyExpiresAt).getTime(), now.getTime() + EMAIL_VERIFY_TTL_MS);
  assert.equal(user.emailVerifySendCount, 1);

  applyVerificationTokenToUser(user, 'token-b', (value) => `hash:${value}`, now);
  assert.equal(user.emailVerifyTokenHash, 'hash:token-b');
  assert.equal(user.emailVerifySendCount, 2);

  markEmailVerified(user, now);
  assert.equal(user.requiresEmailVerification, false);
  assert.equal(user.emailVerifyTokenHash, null);
  assert.equal(user.emailVerifiedAt.toISOString(), now.toISOString());
});

test('resend is limited by cooldown and hourly cap', () => {
  const now = Date.now();
  const cooldown = evaluateVerificationSendLimit({
    emailVerifyLastSentAt: new Date(now - 15_000),
  }, now);
  assert.equal(cooldown.allowed, false);
  assert.equal(cooldown.reason, 'cooldown');
  assert.ok(cooldown.retryAfterSeconds >= 1);
  assert.ok(cooldown.retryAfterSeconds <= Math.ceil(EMAIL_VERIFY_RESEND_COOLDOWN_MS / 1000));

  const hourly = evaluateVerificationSendLimit({
    emailVerifyLastSentAt: new Date(now - EMAIL_VERIFY_RESEND_COOLDOWN_MS - 1),
    emailVerifySendWindowStartedAt: new Date(now - 10_000),
    emailVerifySendCount: EMAIL_VERIFY_MAX_SENDS_PER_WINDOW,
  }, now);
  assert.equal(hourly.allowed, false);
  assert.equal(hourly.reason, 'hourly_limit');
  assert.ok(hourly.retryAfterSeconds <= Math.ceil(EMAIL_VERIFY_SEND_WINDOW_MS / 1000));

  const allowed = evaluateVerificationSendLimit({
    emailVerifyLastSentAt: new Date(now - EMAIL_VERIFY_RESEND_COOLDOWN_MS - 1),
    emailVerifySendWindowStartedAt: new Date(now - EMAIL_VERIFY_SEND_WINDOW_MS - 1),
    emailVerifySendCount: EMAIL_VERIFY_MAX_SENDS_PER_WINDOW,
  }, now);
  assert.equal(allowed.allowed, true);
});

test('raw tokens are unique 32-byte hex values', () => {
  const a = generateEmailVerifyRawToken();
  const b = generateEmailVerifyRawToken();
  assert.equal(a.length, 64);
  assert.equal(b.length, 64);
  assert.notEqual(a, b);
  assert.match(a, /^[a-f0-9]+$/);
});

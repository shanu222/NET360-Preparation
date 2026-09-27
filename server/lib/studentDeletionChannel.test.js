import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyStudentDeletionChannelSync,
  resolveStudentDeletionChannel,
} from './studentDeletionChannel.js';

test('email/password accounts use password deletion', () => {
  assert.equal(classifyStudentDeletionChannelSync({ authProvider: 'local' }), 'password');
  assert.equal(classifyStudentDeletionChannelSync({ authProvider: 'password' }), 'password');
  assert.equal(
    classifyStudentDeletionChannelSync({ authProvider: 'firebase', authProviderDetail: 'password' }),
    'password',
  );
  assert.equal(
    classifyStudentDeletionChannelSync({ authProvider: 'firebase', authProviderDetail: 'firebase' }),
    'password',
  );
});

test('Google accounts use email-link deletion', () => {
  assert.equal(classifyStudentDeletionChannelSync({ authProvider: 'google' }), 'email-link');
  assert.equal(
    classifyStudentDeletionChannelSync({ authProvider: 'firebase', authProviderDetail: 'google' }),
    'email-link',
  );
  assert.equal(
    classifyStudentDeletionChannelSync({ authProvider: 'firebase', authProviderDetail: 'google.com' }),
    'email-link',
  );
});

test('unknown firebase without Google is password, not email-link', () => {
  assert.equal(
    classifyStudentDeletionChannelSync({
      authProvider: 'firebase',
      authProviderDetail: 'unknown',
      email: 'student@example.com',
    }),
    'password',
  );
});

test('Firebase lookup prefers password provider over Google-only email link', async () => {
  const firebaseAdminAuth = {
    async getUser() {
      return {
        providerData: [{ providerId: 'password' }, { providerId: 'google.com' }],
      };
    },
  };
  const channel = await resolveStudentDeletionChannel(
    { authProvider: 'firebase', authProviderDetail: 'unknown', firebaseUid: 'uid-1' },
    firebaseAdminAuth,
  );
  assert.equal(channel, 'password');
});

test('Firebase lookup uses email-link for Google-only accounts', async () => {
  const firebaseAdminAuth = {
    async getUser() {
      return { providerData: [{ providerId: 'google.com' }] };
    },
  };
  const channel = await resolveStudentDeletionChannel(
    { authProvider: 'firebase', authProviderDetail: 'unknown', firebaseUid: 'uid-2' },
    firebaseAdminAuth,
  );
  assert.equal(channel, 'email-link');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MANDATORY_NOTIFICATIONS,
  OPTIONAL_NOTIFICATIONS,
  isOptionalNotificationEnabled,
  mergeNotificationPreferencePatch,
  resolveNotificationPreferences,
} from './notificationPreferences.js';

test('every optional notification defaults to ON when missing', () => {
  const { preferences, changed } = resolveNotificationPreferences(undefined);
  assert.equal(changed, true);
  assert.equal(OPTIONAL_NOTIFICATIONS.length, 10);
  for (const item of OPTIONAL_NOTIFICATIONS) {
    assert.equal(preferences[item.key], true);
    assert.equal(isOptionalNotificationEnabled({}, item.key), true);
  }
});

test('existing saved values are preserved and only missing keys turn ON', () => {
  const { preferences, changed } = resolveNotificationPreferences({
    quizChallenges: false,
    communityMessages: true,
  });
  assert.equal(changed, true);
  assert.equal(preferences.quizChallenges, false);
  assert.equal(preferences.communityMessages, true);
  assert.equal(preferences.nustUpdates, true);
  assert.equal(isOptionalNotificationEnabled({ notificationPreferences: { quizChallenges: false } }, 'quizChallenges'), false);
  assert.equal(isOptionalNotificationEnabled({ notificationPreferences: { quizChallenges: false } }, 'quizResults'), true);
});

test('a complete saved map is not treated as changed', () => {
  const stored = Object.fromEntries(OPTIONAL_NOTIFICATIONS.map((item) => [item.key, item.key !== 'supportReplies']));
  const { preferences, changed } = resolveNotificationPreferences(stored);
  assert.equal(changed, false);
  assert.deepEqual(preferences, stored);
});

test('turning one notification off does not change the others', () => {
  const next = mergeNotificationPreferencePatch(
    { communityMessages: true, quizChallenges: true, nustUpdates: false },
    { quizChallenges: false },
  );
  assert.equal(next.quizChallenges, false);
  assert.equal(next.communityMessages, true);
  assert.equal(next.nustUpdates, false);
  assert.equal(next.videoUploads, true);
  assert.equal(next.connectionRequests, true);
  assert.equal(isOptionalNotificationEnabled({ notificationPreferences: next }, 'quizChallenges'), false);
  assert.equal(isOptionalNotificationEnabled({ notificationPreferences: next }, 'communityMessages'), true);
});

test('mandatory account emails are listed separately and are not optional keys', () => {
  assert.deepEqual(
    MANDATORY_NOTIFICATIONS.map((item) => item.key),
    ['emailVerification', 'passwordReset', 'accountDeletion'],
  );
  for (const item of MANDATORY_NOTIFICATIONS) {
    assert.equal(isOptionalNotificationEnabled({}, item.key), false);
  }
});

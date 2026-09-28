import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySharedNotificationPreferences,
  notificationAllowed,
  resolveSharedNotificationPreferences,
} from './unifiedNotificationPreferences.js';

test('an existing user keeps a saved off switch and missing switches stay on', () => {
  const resolved = resolveSharedNotificationPreferences({
    emailNotifications: true,
    contentUpdates: false,
    notificationPreferences: { quizChallenges: false, videoUploads: true },
  });
  assert.equal(resolved.notificationPreferences.enabled, true);
  assert.equal(resolved.notificationPreferences.newVideos, false);
  assert.equal(resolved.notificationPreferences.videoUploads, false);
  assert.equal(resolved.contentUpdates, false);
  assert.equal(resolved.notificationPreferences.quizChallenges, false);
  assert.equal(resolved.notificationPreferences.communityMessages, true);
  assert.equal(resolved.notificationPreferences.nustNotices, true);
  assert.equal(resolved.notificationPreferences.netUpdates, true);
});

test('a web master switch off is the android master switch off', () => {
  const stored = applySharedNotificationPreferences(
    { emailNotifications: true, contentUpdates: true, notificationPreferences: { videoUploads: true, nustUpdates: true } },
    { emailNotifications: false, notificationPreferences: { enabled: false } },
  );
  assert.equal(stored.emailNotifications, false);
  assert.equal(stored.notificationPreferences.enabled, false);
  assert.equal(notificationAllowed(stored, 'video-published'), false);
  assert.equal(notificationAllowed(stored, 'nust'), false);
  assert.equal(notificationAllowed(stored, 'netUpdates'), false);
  assert.equal(notificationAllowed(stored, 'daily-reminder'), false);
  assert.equal(notificationAllowed(stored, 'communityMessages'), false);
  const fromAndroid = applySharedNotificationPreferences(stored, {
    emailNotifications: true,
    notificationPreferences: { enabled: true },
  });
  assert.equal(fromAndroid.emailNotifications, true);
  assert.equal(fromAndroid.contentUpdates, true);
  assert.equal(notificationAllowed(fromAndroid, 'newVideos'), true);
});

test('video notifications are one field for web content updates and android video uploads', () => {
  const fromWeb = applySharedNotificationPreferences(
    { emailNotifications: true, contentUpdates: true, notificationPreferences: { videoUploads: true } },
    { contentUpdates: false, notificationPreferences: { newVideos: false } },
  );
  assert.equal(fromWeb.notificationPreferences.newVideos, false);
  assert.equal(fromWeb.notificationPreferences.videoUploads, false);
  assert.equal(fromWeb.contentUpdates, false);
  assert.equal(notificationAllowed(fromWeb, 'video-published'), false);
  assert.equal(notificationAllowed(fromWeb, 'nustNotices'), true);

  const fromAndroid = applySharedNotificationPreferences(fromWeb, {
    notificationPreferences: { videoUploads: true, newVideos: true },
  });
  assert.equal(fromAndroid.contentUpdates, true);
  assert.equal(fromAndroid.notificationPreferences.newVideos, true);
  assert.equal(notificationAllowed(fromAndroid, 'video-published'), true);
  assert.equal(fromAndroid.notificationPreferences.communityMessages, true);
});

test('turning video notifications back on does not invent a backlog', () => {
  const off = applySharedNotificationPreferences({}, { notificationPreferences: { newVideos: false } });
  const on = applySharedNotificationPreferences(off, { notificationPreferences: { newVideos: true } });
  assert.equal(on.notificationPreferences.newVideos, true);
  assert.equal(Object.hasOwn(on, 'videos'), false);
  assert.equal(notificationAllowed({ contentUpdates: false }, 'video-published'), false);
  assert.equal(notificationAllowed({ notificationPreferences: { newVideos: true, videoUploads: false } }, 'video-published'), true);
});

test('the NUST control covers notices and NET updates without changing other categories', () => {
  const off = applySharedNotificationPreferences(
    { notificationPreferences: { videoUploads: true, quizResults: false } },
    { notificationPreferences: { nustUpdates: false } },
  );
  assert.equal(off.notificationPreferences.nustNotices, false);
  assert.equal(off.notificationPreferences.netUpdates, false);
  assert.equal(off.notificationPreferences.nustUpdates, false);
  assert.equal(notificationAllowed(off, 'nust'), false);
  assert.equal(notificationAllowed(off, 'netUpdates'), false);
  assert.equal(notificationAllowed(off, 'video-published'), true);
  assert.equal(off.notificationPreferences.quizResults, false);
  const on = applySharedNotificationPreferences(off, { notificationPreferences: { nustNotices: true } });
  assert.equal(on.notificationPreferences.netUpdates, true);
  assert.equal(on.notificationPreferences.videoUploads, true);
});

test('turning notifications off stores one master flag and leaves other saved categories intact', () => {
  const off = applySharedNotificationPreferences(
    { notificationPreferences: { quizChallenges: false, newVideos: true } },
    { emailNotifications: false },
  );
  assert.equal(off.notificationPreferences.enabled, false);
  assert.equal(off.emailNotifications, false);
  assert.equal(off.notificationPreferences.newVideos, true);
  assert.equal(off.notificationPreferences.quizChallenges, false);
  assert.equal(notificationAllowed(off, 'video-published'), false);
});

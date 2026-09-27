import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_NOTIFY_WINDOW_MS,
  COMMUNITY_FILE_MAX_BYTES,
  buildNotificationDeliveryId,
  communityChatWindowKey,
  communityFileMimeMatchesKind,
  communityNotifyEvent,
  isRecentCommunityEvent,
  notificationRecipientKey,
  shouldSendChatWindowNotification,
  sniffCommunityFileKind,
  supportChatWindowKey,
  tryReserveLocalDeliveryId,
} from './communityNotifications.js';

test('community file limit is 10MB', () => {
  assert.equal(COMMUNITY_FILE_MAX_BYTES, 10 * 1024 * 1024);
});

test('event keys are unique per event and user-facing status', () => {
  assert.equal(communityNotifyEvent.connectionRequest('req-1'), 'connection.request:req-1');
  assert.equal(communityNotifyEvent.connectionResponse('req-1', 'accepted'), 'connection.response:req-1:accepted');
  assert.notEqual(
    communityNotifyEvent.quizResponse('q-1', 'accept'),
    communityNotifyEvent.quizResponse('q-1', 'decline'),
  );
  assert.equal(communityNotifyEvent.quizResult('q-1'), 'quiz.result:q-1');
  assert.equal(communityNotifyEvent.communityMessage('msg-1'), 'community.message:msg-1');
  assert.equal(communityNotifyEvent.supportUserMessage('sup-1'), 'support.user-message:sup-1');
  assert.equal(communityNotifyEvent.supportAdminReply('sup-2'), 'support.admin-reply:sup-2');
  assert.equal(
    communityNotifyEvent.communityChatWindow('conn-1', 'user-b', 1000),
    'community.chat-window:conn-1:user-b:1000',
  );
  assert.equal(communityNotifyEvent.supportUserWindow('user-1', 2000), 'support.user-window:user-1:2000');
  assert.equal(communityNotifyEvent.supportAdminWindow('user-1', 3000), 'support.admin-window:user-1:3000');
});

test('chat window keys are per conversation and recipient side', () => {
  assert.equal(communityChatWindowKey('conn-1', 'user-b'), 'community:conn-1:to:user-b');
  assert.notEqual(communityChatWindowKey('conn-1', 'user-b'), communityChatWindowKey('conn-1', 'user-a'));
  assert.equal(supportChatWindowKey('user-1', 'admin'), 'support:user-1:to:admin');
  assert.equal(supportChatWindowKey('user-1', 'user'), 'support:user-1:to:user');
  assert.notEqual(supportChatWindowKey('user-1', 'admin'), supportChatWindowKey('user-1', 'user'));
});

test('chat email window sends once until reply or 30 minutes', () => {
  const t0 = Date.parse('2026-09-27T12:00:00.000Z');
  assert.equal(shouldSendChatWindowNotification(null, t0), true);
  assert.equal(shouldSendChatWindowNotification({ lastNotifiedAt: null, lastReplyAt: null }, t0), true);
  assert.equal(
    shouldSendChatWindowNotification({ lastNotifiedAt: new Date(t0), lastReplyAt: null }, t0 + 5 * 60 * 1000),
    false,
  );
  assert.equal(
    shouldSendChatWindowNotification({ lastNotifiedAt: new Date(t0), lastReplyAt: null }, t0 + CHAT_NOTIFY_WINDOW_MS),
    true,
  );
  assert.equal(
    shouldSendChatWindowNotification({
      lastNotifiedAt: new Date(t0),
      lastReplyAt: new Date(t0 + 60 * 1000),
    }, t0 + 2 * 60 * 1000),
    true,
  );
  assert.equal(CHAT_NOTIFY_WINDOW_MS, 30 * 60 * 1000);
});

test('recent-event window treats pending-age dates as relevant', () => {
  const now = Date.parse('2026-09-27T00:00:00.000Z');
  assert.equal(isRecentCommunityEvent(new Date(now - 10 * 24 * 60 * 60 * 1000), now), true);
  assert.equal(isRecentCommunityEvent(new Date(now - 120 * 24 * 60 * 60 * 1000), now), false);
  assert.equal(isRecentCommunityEvent(null, now), false);
});

test('sniffs PDF, images, and rejects HTML/SVG payloads', () => {
  assert.equal(sniffCommunityFileKind(Buffer.from('%PDF-1.7\n')), 'pdf');
  assert.equal(sniffCommunityFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'jpeg');
  assert.equal(sniffCommunityFileKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'png');
  assert.equal(sniffCommunityFileKind(Buffer.from('RIFF....WEBP')), 'webp');
  assert.equal(sniffCommunityFileKind(Buffer.from('<!DOCTYPE html><script>alert(1)</script>')), 'unsafe');
  assert.equal(sniffCommunityFileKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), 'unsafe');
  assert.equal(communityFileMimeMatchesKind('image/jpeg', 'jpeg'), true);
  assert.equal(communityFileMimeMatchesKind('application/pdf', 'jpeg'), false);
});

test('delivery ids are stable per event and recipient inbox', () => {
  assert.equal(notificationRecipientKey('user-1', 'A@Net360Preparation.com'), 'a@net360preparation.com');
  assert.equal(
    buildNotificationDeliveryId('community.message:msg-1', 'user-1', 'A@Net360Preparation.com'),
    buildNotificationDeliveryId('community.message:msg-1', 'user-9', 'a@net360preparation.com'),
  );
  assert.notEqual(
    buildNotificationDeliveryId('community.message:msg-1', 'user-1', 'a@example.com'),
    buildNotificationDeliveryId('community.message:msg-2', 'user-1', 'a@example.com'),
  );
});

test('local reserve allows only one send for the same delivery id', () => {
  const deliveryId = buildNotificationDeliveryId('community.message:once-test', 'user-1', 'once@example.com');
  assert.equal(tryReserveLocalDeliveryId(deliveryId), true);
  assert.equal(tryReserveLocalDeliveryId(deliveryId), false);
  assert.equal(tryReserveLocalDeliveryId(deliveryId), false);
});


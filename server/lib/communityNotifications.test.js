import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMUNITY_FILE_MAX_BYTES,
  communityFileMimeMatchesKind,
  communityNotifyEvent,
  isRecentCommunityEvent,
  sniffCommunityFileKind,
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

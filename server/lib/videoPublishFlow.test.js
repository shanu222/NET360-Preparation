import assert from 'node:assert/strict';
import test from 'node:test';
import {
  notifyVideoPublished,
  shouldStartVideoPublicationCampaign,
} from './videoPublishNotify.js';

function memoryReceipts() {
  const rows = new Map();
  return {
    rows,
    async find(eventId) { return rows.get(eventId) || null; },
    async save(receipt) { rows.set(receipt.eventId, { ...receipt }); },
  };
}

const video = {
  _id: 'upload-1',
  title: 'Kinematics lecture',
  subject: 'Physics',
  part: 'Mechanics',
  chapter: 'Motion',
  section: 'Kinematics',
  topic: 'Velocity',
  status: 'published',
};

const users = [
  { _id: 'on', email: 'on@example.com', firstName: 'Ayesha', role: 'student', preferences: { emailNotifications: true, notificationPreferences: { enabled: true, newVideos: true } } },
  { _id: 'web-off', email: 'web@example.com', firstName: 'Web', role: 'student', preferences: { emailNotifications: true, contentUpdates: false } },
  { _id: 'android-off', email: 'android@example.com', firstName: 'Android', role: 'student', preferences: { notificationPreferences: { videoUploads: false, newVideos: false } } },
  { _id: 'master-off', email: 'off@example.com', firstName: 'Off', role: 'student', preferences: { emailNotifications: false, notificationPreferences: { enabled: false, newVideos: true } } },
  { _id: 'admin', email: 'admin@example.com', firstName: 'Admin', role: 'admin', preferences: { emailNotifications: true } },
];

test('a real publish writes in-app notices and never emails', async () => {
  assert.equal(shouldStartVideoPublicationCampaign('draft', 'published'), true);
  assert.equal(shouldStartVideoPublicationCampaign('published', 'published'), false);
  assert.equal(shouldStartVideoPublicationCampaign('unpublished', 'published'), false);
  assert.equal(shouldStartVideoPublicationCampaign('', 'draft'), false);

  const inbox = [];
  const receipts = memoryReceipts();
  let completed = false;
  let emailed = 0;
  const first = await notifyVideoPublished(video, {
    users,
    receipts,
    recordInbox: async (user) => { inbox.push(String(user._id)); },
    claim: async () => video,
    complete: async () => { completed = true; },
    send: async () => { emailed += 1; return { provider: 'resend', messageId: 'should-not-send' }; },
  });

  assert.equal(first.status, 'complete');
  assert.equal(first.sent, 0);
  assert.equal(first.failed, 0);
  assert.equal(first.skipped, 4);
  assert.equal(completed, true);
  assert.equal(emailed, 0);
  assert.equal(receipts.rows.get('video-published:upload-1:on').status, 'skipped');
  assert.equal(receipts.rows.get('video-published:upload-1:on').error, 'video-email-disabled');
  assert.equal(receipts.rows.get('video-published:upload-1:web-off').status, 'skipped');
  assert.equal(receipts.rows.get('video-published:upload-1:android-off').status, 'skipped');
  assert.equal(receipts.rows.get('video-published:upload-1:master-off').status, 'skipped');
  assert.equal(receipts.rows.has('video-published:upload-1:admin'), false);
  assert.deepEqual(inbox, ['on', 'web-off', 'android-off', 'master-off']);

  const again = await notifyVideoPublished(video, {
    users,
    receipts,
    claim: async () => null,
    send: async () => { emailed += 1; },
  });
  assert.equal(again.status, 'not-claimed');
  assert.equal(emailed, 0);
});

test('already skipped video receipts are not emailed on retry', async () => {
  const receipts = memoryReceipts();
  let emailed = 0;
  const options = {
    users: users.filter((user) => user._id === 'on' || user._id === 'web-off'),
    receipts,
    claim: async (item) => item,
    complete: async () => undefined,
    send: async () => { emailed += 1; return { provider: 'resend', messageId: 'should-not-send' }; },
  };
  const first = await notifyVideoPublished({ ...video, _id: 'upload-2' }, options);
  assert.equal(first.status, 'complete');
  assert.equal(first.sent, 0);
  assert.equal(first.skipped, 2);
  assert.equal(receipts.rows.get('video-published:upload-2:on').status, 'skipped');
  assert.equal(receipts.rows.get('video-published:upload-2:web-off').status, 'skipped');

  const retried = await notifyVideoPublished({ ...video, _id: 'upload-2' }, options);
  assert.equal(retried.status, 'complete');
  assert.equal(retried.sent, 0);
  assert.equal(retried.skipped, 2);
  assert.equal(emailed, 0);
});

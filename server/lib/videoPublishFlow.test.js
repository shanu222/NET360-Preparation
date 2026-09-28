import assert from 'node:assert/strict';
import test from 'node:test';
import { sendTransactionalEmail } from './outboundEmail.js';
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

function providerError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
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

test('a real publish sends one email to eligible users and none when notifications are off', async () => {
  assert.equal(shouldStartVideoPublicationCampaign('draft', 'published'), true);
  assert.equal(shouldStartVideoPublicationCampaign('published', 'published'), false);
  assert.equal(shouldStartVideoPublicationCampaign('unpublished', 'published'), false);
  assert.equal(shouldStartVideoPublicationCampaign('', 'draft'), false);

  const calls = [];
  const receipts = memoryReceipts();
  let completed = false;
  const first = await notifyVideoPublished(video, {
    users,
    receipts,
    claim: async () => video,
    complete: async () => { completed = true; },
    send: (message) => sendTransactionalEmail(message, {
      resendReady: true,
      sendResend: async () => {
        calls.push(['resend', message.to]);
        if (calls.filter((item) => item[0] === 'resend').length === 1) {
          throw providerError('Resend 429: daily quota exceeded', 429);
        }
        return { provider: 'resend', messageId: 'resend-1' };
      },
      sendBrevo: async () => {
        calls.push(['brevo', message.to]);
        return { provider: 'brevo', messageId: 'brevo-1' };
      },
    }),
  });

  assert.equal(first.status, 'complete');
  assert.equal(first.sent, 1);
  assert.equal(completed, true);
  assert.deepEqual(calls, [
    ['resend', 'on@example.com'],
    ['brevo', 'on@example.com'],
  ]);
  assert.equal(receipts.rows.get('video-published:upload-1:on').provider, 'brevo');
  assert.equal(receipts.rows.get('video-published:upload-1:web-off').status, 'skipped');
  assert.equal(receipts.rows.get('video-published:upload-1:android-off').status, 'skipped');
  assert.equal(receipts.rows.get('video-published:upload-1:master-off').status, 'skipped');
  assert.equal(receipts.rows.has('video-published:upload-1:admin'), false);

  calls.length = 0;
  const again = await notifyVideoPublished(video, {
    users,
    receipts,
    claim: async () => null,
    send: async () => { calls.push('duplicate'); },
  });
  assert.equal(again.status, 'not-claimed');
  assert.deepEqual(calls, []);
});

test('a provider failure is retried once and does not email users who were already sent or switched off', async () => {
  const calls = [];
  const receipts = memoryReceipts();
  let attempts = 0;
  const send = async (message) => {
    attempts += 1;
    calls.push(message.to);
    if (attempts === 1) throw providerError('Resend 503: unavailable', 503);
    return { provider: 'resend', messageId: 'ok' };
  };
  const options = {
    users: users.filter((user) => user._id === 'on' || user._id === 'web-off'),
    receipts,
    claim: async (item) => item,
    complete: async () => undefined,
    send,
  };
  const failed = await notifyVideoPublished({ ...video, _id: 'upload-2' }, options);
  assert.equal(failed.status, 'retry');
  assert.equal(failed.failed, 1);
  assert.equal(receipts.rows.get('video-published:upload-2:web-off').status, 'skipped');

  const retried = await notifyVideoPublished({ ...video, _id: 'upload-2' }, options);
  assert.equal(retried.status, 'complete');
  assert.equal(retried.sent, 1);
  assert.deepEqual(calls, ['on@example.com', 'on@example.com']);

  const third = await notifyVideoPublished({ ...video, _id: 'upload-2' }, options);
  assert.equal(third.sent, 0);
  assert.deepEqual(calls, ['on@example.com', 'on@example.com']);
});

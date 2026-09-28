import assert from 'node:assert/strict';
import test from 'node:test';
import { wantsVideoNotification, mergeNotificationPreferencePatch } from './videoNotificationPreference.js';
import { WELCOME_EMAIL_SUBJECT, buildWelcomeEmail, sendWelcomeEmailOnce } from './welcomeEmail.js';
import { deliverVideoPublicationEmails } from './videoPublishNotify.js';

test('old users without the welcome flag are not emailed', async () => {
  let sends = 0;
  const result = await sendWelcomeEmailOnce(
    { _id: 'old', email: 'old@example.com', welcomeEmailSent: undefined, role: 'student' },
    { users: { findOneAndUpdate() { throw new Error('should not claim'); } }, send() { sends += 1; } },
  );
  assert.equal(result.status, 'skipped');
  assert.equal(sends, 0);
});

test('a new user receives exactly one welcome email', async () => {
  const sends = [];
  let stored = false;
  const users = {
    async findOneAndUpdate(filter) {
      assert.equal(filter.welcomeEmailSent, false);
      if (stored) return null;
      stored = true;
      return { _id: 'new', email: 'new@example.com', firstName: 'Ayesha', welcomeEmailSent: false };
    },
    async updateOne() {
      stored = false;
    },
  };
  const first = await sendWelcomeEmailOnce(
    { _id: 'new', email: 'new@example.com', firstName: 'Ayesha', welcomeEmailSent: false, role: 'student' },
    { users, send: async (message) => { sends.push(message); return { provider: 'brevo' }; } },
  );
  const second = await sendWelcomeEmailOnce(
    { _id: 'new', email: 'new@example.com', firstName: 'Ayesha', welcomeEmailSent: false, role: 'student' },
    { users, send: async (message) => { sends.push(message); return { provider: 'brevo' }; } },
  );
  assert.equal(first.status, 'sent');
  assert.equal(second.status, 'skipped');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].subject, WELCOME_EMAIL_SUBJECT);
  assert.match(sends[0].html, /Practice Board/);
  assert.match(sends[0].html, /Video Lectures/);
  assert.match(sends[0].text, /Merit Calculator/);
  assert.match(buildWelcomeEmail().html, /Community/);
});

test('video notifications follow the saved preference and do not repeat', async () => {
  assert.equal(wantsVideoNotification({ emailNotifications: true, contentUpdates: true }), true);
  assert.equal(wantsVideoNotification({ emailNotifications: true, contentUpdates: false }), false);
  assert.equal(wantsVideoNotification({ emailNotifications: true, notificationPreferences: { videoUploads: false } }), false);
  assert.equal(wantsVideoNotification({ emailNotifications: false, contentUpdates: true }), false);
  assert.equal(wantsVideoNotification({}), true);

  const turnedOff = mergeNotificationPreferencePatch({ videoUploads: true }, { videoUploads: false });
  assert.equal(turnedOff.videoUploads, false);
  const turnedOn = mergeNotificationPreferencePatch(turnedOff, { videoUploads: true });
  assert.equal(turnedOn.videoUploads, true);

  const video = {
    _id: 'vid-1',
    title: 'Limits and continuity',
    subject: 'Mathematics',
    section: 'Functions',
    topic: 'Limits',
    status: 'published',
  };
  const users = [
    { _id: 'on', email: 'on@example.com', firstName: 'On', preferences: { emailNotifications: true, contentUpdates: true, notificationPreferences: { videoUploads: true } } },
    { _id: 'off', email: 'off@example.com', firstName: 'Off', preferences: { emailNotifications: true, notificationPreferences: { videoUploads: false } } },
    { _id: 'web-off', email: 'web@example.com', firstName: 'Web', preferences: { emailNotifications: true, contentUpdates: false } },
  ];
  const sent = [];
  await deliverVideoPublicationEmails(video, {
    users,
    send: async (message) => { sent.push(message.to); },
  });
  await deliverVideoPublicationEmails(video, {
    users: users.filter((user) => user._id === 'on'),
    send: async (message) => { sent.push(message.to); },
    alreadySentUserIds: new Set(['on']),
  });
  assert.deepEqual(sent, ['on@example.com']);
  assert.match(sent.length ? 'Limits and continuity' : '', /Limits/);
});

test('a video email includes the title and topic path', async () => {
  const sent = [];
  await deliverVideoPublicationEmails({
    _id: 'vid-2',
    title: 'Organic basics',
    subject: 'Chemistry',
    part: 'Part 1',
    chapter: 'Hydrocarbons',
    section: 'Alkanes',
    topic: 'Naming',
  }, {
    users: [{ _id: 'u', email: 'u@example.com', firstName: 'Ali', preferences: { contentUpdates: true, notificationPreferences: { videoUploads: true } } }],
    send: async (message) => { sent.push(message); },
  });
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Organic basics/);
  assert.match(sent[0].text, /Chemistry → Part 1 → Hydrocarbons → Alkanes → Naming/);
});

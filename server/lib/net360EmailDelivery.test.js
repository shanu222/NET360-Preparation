import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyProviderError,
  createNet360EmailDelivery,
  emailAllowedByPreference,
  isoWeekKey,
  shouldAnnounceVideoPublish,
} from '../services/net360EmailDelivery.js';

function memoryStore() {
  const rows = new Map();
  return {
    async create(doc) {
      if (rows.has(doc.eventId)) return { duplicate: true, doc: { ...rows.get(doc.eventId) } };
      const saved = { ...doc, createdAt: new Date(), updatedAt: new Date() };
      rows.set(doc.eventId, saved);
      return { duplicate: false, doc: { ...saved } };
    },
    async update(eventId, patch) {
      const current = rows.get(eventId);
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: new Date() };
      rows.set(eventId, next);
      return { ...next };
    },
    async findRetryable(now) {
      return [...rows.values()].filter((row) => (
        row.status === 'retry' && row.nextAttemptAt && new Date(row.nextAttemptAt) <= now
      )).map((row) => ({ ...row }));
    },
    rows,
  };
}

function providerError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function harness(handlers = {}) {
  const calls = [];
  const store = memoryStore();
  const delivery = createNet360EmailDelivery({
    store,
    retryDelayMs: 0,
    sleep: async () => {},
    sendResend: async (message) => {
      calls.push(['resend', message.eventId]);
      if (handlers.resend) return handlers.resend(message, calls);
      return { messageId: 'resend-1' };
    },
    sendBrevo: async (message) => {
      calls.push(['brevo', message.eventId]);
      if (handlers.brevo) return handlers.brevo(message, calls);
      return { messageId: 'brevo-1' };
    },
    sendSmtp: async (message) => {
      calls.push(['smtp', message.eventId]);
      if (handlers.smtp) return handlers.smtp(message);
      return { messageId: 'smtp-1' };
    },
  });
  return { ...delivery, calls, store };
}

const message = {
  eventId: 'verification:evt-1:user-1',
  userId: 'user-1',
  recipientEmail: 'student@example.com',
  emailType: 'verification',
  mandatory: true,
  subject: 'Verify',
  text: 'token',
  html: '<p>token</p>',
};

test('Resend success sends only through Resend', async () => {
  const { sendNet360Email, calls } = harness();
  const result = await sendNet360Email(message);
  assert.equal(result.status, 'sent');
  assert.equal(result.provider, 'resend');
  assert.equal(result.providerMessageId, 'resend-1');
  assert.deepEqual(calls.map((item) => item[0]), ['resend']);
});

test('Resend quota falls back to Brevo and does not send twice', async () => {
  const { sendNet360Email, calls } = harness({
    resend: () => { throw providerError('Resend 429: daily quota exceeded', 429); },
  });
  const result = await sendNet360Email({ ...message, eventId: 'video-published:vid-1:user-1', emailType: 'video-published' });
  assert.equal(result.status, 'sent');
  assert.equal(result.provider, 'brevo');
  assert.deepEqual(calls.map((item) => item[0]), ['resend', 'brevo']);
});

test('temporary Resend failure retries once and then uses Brevo', async () => {
  let attempts = 0;
  const { sendNet360Email, calls } = harness({
    resend: () => {
      attempts += 1;
      throw providerError('Resend 503: temporarily unavailable', 503);
    },
  });
  const result = await sendNet360Email({ ...message, eventId: 'support:evt:user-1', emailType: 'support' });
  assert.equal(result.status, 'sent');
  assert.equal(result.provider, 'brevo');
  assert.equal(attempts, 2);
  assert.deepEqual(calls.map((item) => item[0]), ['resend', 'resend', 'brevo']);
});

test('Brevo success is marked sent', async () => {
  const { sendNet360Email } = harness({
    resend: () => { throw providerError('Resend 429: rate limit', 429); },
    brevo: async () => ({ messageId: 'brevo-accepted' }),
  });
  const result = await sendNet360Email({ ...message, eventId: 'quiz:evt:user-1', emailType: 'quiz-battle' });
  assert.equal(result.status, 'sent');
  assert.equal(result.provider, 'brevo');
  assert.equal(result.providerMessageId, 'brevo-accepted');
  assert.ok(result.sentAt);
});

test('both providers failing keeps the email in the retry queue', async () => {
  const { sendNet360Email, processRetryQueue, calls } = harness({
    resend: () => { throw providerError('Resend 503: down', 503); },
    brevo: () => { throw providerError('Brevo 503: down', 503); },
  });
  const result = await sendNet360Email({ ...message, eventId: 'community:evt:user-1', emailType: 'community' });
  assert.equal(result.status, 'retry');
  assert.equal(calls.filter((item) => item[0] === 'brevo').length, 1);
  const queued = await processRetryQueue(new Date(Date.now() + 60 * 60 * 1000));
  assert.equal(queued.length, 1);
  assert.equal(queued[0].status, 'retry');
});

test('the same event is not sent twice', async () => {
  const { sendNet360Email, calls } = harness();
  const eventId = 'daily-reminder:2026-09-28:user-1';
  const first = await sendNet360Email({ ...message, eventId, emailType: 'daily-reminder', preferences: { dailyReminders: true } });
  const second = await sendNet360Email({ ...message, eventId, emailType: 'daily-reminder', preferences: { dailyReminders: true } });
  assert.equal(first.status, 'sent');
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.status, 'sent');
  assert.equal(calls.length, 1);
});

test('invalid recipients do not fall back to Brevo', async () => {
  const { sendNet360Email, calls } = harness({
    resend: () => { throw providerError('Resend 422: Invalid `to` field. Invalid email address.', 422); },
  });
  const result = await sendNet360Email({ ...message, eventId: 'verification:bad:user-1' });
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCategory, 'permanent-recipient');
  assert.deepEqual(calls.map((item) => item[0]), ['resend']);
});

test('disabled email notifications skip event email', async () => {
  const { sendNet360Email, calls } = harness();
  const result = await sendNet360Email({
    ...message,
    mandatory: false,
    eventId: 'video-published:vid-2:user-1',
    emailType: 'video-published',
    preferences: { emailNotifications: false },
  });
  assert.equal(result.status, 'skipped');
  assert.equal(calls.length, 0);
});

test('disabled daily reminders skip the daily email', async () => {
  const { sendNet360Email, calls } = harness();
  const result = await sendNet360Email({
    ...message,
    mandatory: false,
    eventId: 'daily-reminder:2026-09-28:user-2',
    emailType: 'daily-reminder',
    preferences: { dailyReminders: false, emailNotifications: true },
  });
  assert.equal(result.status, 'skipped');
  assert.equal(calls.length, 0);
});

test('disabled performance reports skip the weekly email', async () => {
  const { sendNet360Email, calls } = harness();
  const result = await sendNet360Email({
    ...message,
    mandatory: false,
    eventId: 'weekly-report:2026-W40:user-2',
    emailType: 'weekly-report',
    preferences: { performanceReports: false, emailNotifications: true },
  });
  assert.equal(result.status, 'skipped');
  assert.equal(calls.length, 0);
});

test('web, Android, and iOS events share one backend send path', async () => {
  const { sendNet360Email, calls } = harness();
  for (const source of ['web', 'android', 'ios']) {
    const result = await sendNet360Email({
      ...message,
      eventId: `nust:hash-1:user-${source}`,
      emailType: 'nust',
      source,
    });
    assert.equal(result.status, 'sent');
    assert.equal(result.provider, 'resend');
  }
  assert.equal(calls.length, 3);
  assert.ok(calls.every((item) => item[0] === 'resend'));
});

test('a video is announced only the first time it is published', () => {
  assert.equal(shouldAnnounceVideoPublish('', 'https://cdn.example/video.mp4'), true);
  assert.equal(shouldAnnounceVideoPublish('https://cdn.example/video.mp4', 'https://cdn.example/replacement.mp4'), false);
  assert.equal(shouldAnnounceVideoPublish('https://cdn.example/video.mp4', ''), false);
  assert.equal(shouldAnnounceVideoPublish('', ''), false);
});

test('republishing the same video event does not send another email', async () => {
  const { sendNet360Email, calls } = harness();
  const eventId = 'video-published:mcq-9:user-1';
  await sendNet360Email({ ...message, eventId, emailType: 'video-published', preferences: { emailNotifications: true } });
  const again = await sendNet360Email({ ...message, eventId, emailType: 'video-published', preferences: { emailNotifications: true } });
  assert.equal(again.duplicate, true);
  assert.equal(calls.length, 1);
});

test('verification still sends when event notifications are disabled', () => {
  assert.equal(emailAllowedByPreference({
    emailType: 'verification',
    preferences: { emailNotifications: false },
    mandatory: true,
  }), true);
  assert.equal(emailAllowedByPreference({
    emailType: 'account-deletion',
    preferences: { emailNotifications: false },
  }), true);
});

test('provider errors are classified without treating quota as a bad address', () => {
  assert.equal(classifyProviderError(providerError('daily quota exceeded', 429)), 'quota');
  assert.equal(classifyProviderError(providerError('Invalid email address', 422)), 'permanent-recipient');
  assert.equal(classifyProviderError(providerError('domain is not verified', 403)), 'temporary');
  assert.equal(isoWeekKey(new Date('2026-09-28T12:00:00Z')), '2026-W40');
});

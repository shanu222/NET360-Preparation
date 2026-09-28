import assert from 'node:assert/strict';
import test from 'node:test';
import { WELCOME_EMAIL_SUBJECT, buildWelcomeEmail, sendWelcomeEmailOnce } from './welcomeEmail.js';

test('old users without the welcome flag are not emailed', async () => {
  let sends = 0;
  const result = await sendWelcomeEmailOnce(
    { _id: 'old', email: 'old@example.com', role: 'student' },
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
      return { _id: 'new', email: 'new@example.com', firstName: 'Ayesha' };
    },
    async updateOne() {
      stored = false;
    },
  };
  const first = await sendWelcomeEmailOnce(
    { _id: 'new', email: 'new@example.com', firstName: 'Ayesha', welcomeEmailSent: false, role: 'student' },
    { users, send: async (message) => { sends.push(message); return { status: 'sent', provider: 'brevo' }; } },
  );
  const second = await sendWelcomeEmailOnce(
    { _id: 'new', email: 'new@example.com', firstName: 'Ayesha', welcomeEmailSent: false, role: 'student' },
    { users, send: async (message) => { sends.push(message); return { status: 'sent' }; } },
  );
  assert.equal(first.status, 'sent');
  assert.equal(second.status, 'skipped');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].subject, WELCOME_EMAIL_SUBJECT);
  assert.match(buildWelcomeEmail().html, /Practice Board/);
  assert.match(sends[0].text, /Video Lectures/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isProviderLimitError, sendTransactionalEmail } from './outboundEmail.js';

test('mail uses Resend first and Brevo only after a sending limit', async () => {
  const calls = [];
  const sent = await sendTransactionalEmail({ to: 'a@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }, {
    resendReady: true,
    sendResend: async () => {
      calls.push('resend');
      return { provider: 'resend', messageId: 'r1' };
    },
    sendBrevo: async () => {
      calls.push('brevo');
      return { provider: 'brevo', messageId: 'b1' };
    },
  });
  assert.equal(sent.provider, 'resend');
  assert.deepEqual(calls, ['resend']);

  const limited = await sendTransactionalEmail({ to: 'a@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }, {
    resendReady: true,
    sendResend: async () => {
      calls.push('resend');
      const error = new Error('Resend 429: daily quota exceeded');
      error.status = 429;
      throw error;
    },
    sendBrevo: async () => {
      calls.push('brevo');
      return { provider: 'brevo', messageId: 'b2' };
    },
  });
  assert.equal(limited.provider, 'brevo');
  assert.equal(isProviderLimitError(Object.assign(new Error('daily sending limit'), { status: 429 })), true);
  assert.deepEqual(calls, ['resend', 'resend', 'brevo']);
});

test('a non-limit Resend failure does not switch providers', async () => {
  await assert.rejects(
    () => sendTransactionalEmail({ to: 'a@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }, {
      resendReady: true,
      sendResend: async () => {
        const error = new Error('Resend 422: Invalid email address');
        error.status = 422;
        throw error;
      },
      sendBrevo: async () => {
        throw new Error('Brevo should not be called');
      },
    }),
    /Invalid email address/,
  );
});

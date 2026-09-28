import { UserModel } from '../models/User.js';
import { notificationShell } from '../services/notificationEmail.js';
import { sendTransactionalEmail } from './outboundEmail.js';

export const WELCOME_EMAIL_SUBJECT = 'Welcome to NET360 — Your Smart NET Preparation Platform';

const WELCOME_FEATURES = [
  ['Practice Board', 'Work through practice questions one at a time.'],
  ['NET Tests', 'Take subject tests, full mocks, and review your attempts.'],
  ['Preparation Materials', 'Browse the syllabus by subject, part, chapter, and section.'],
  ['Video Lectures', 'Watch lectures published for your topics.'],
  ['NUST Guide', 'Read the NUST guide and official schedule notices.'],
  ['Analytics', 'Track accuracy, progress, and test performance.'],
  ['Merit Calculator', 'Estimate merit from your academic record.'],
  ['Community', 'Connect with other NET students.'],
  ['NET resources', 'Use the NET types, programs, and preparation tools in one place.'],
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appBase() {
  return String(process.env.NET360_PUBLIC_WEB_BASE || process.env.PUBLIC_WEB_BASE_URL || 'https://www.net360preparation.com')
    .replace(/\/$/, '');
}

export function buildWelcomeEmail({ firstName, appUrl } = {}) {
  const greeting = String(firstName || '').trim() || 'there';
  const url = String(appUrl || appBase());
  const featureText = WELCOME_FEATURES.map(([name, detail]) => `${name}: ${detail}`).join('\n');
  const featureHtml = WELCOME_FEATURES.map(([name, detail]) => (
    `<tr><td style="padding:8px 12px;border:1px solid #e0e7ff;border-radius:12px;background:#f8faff;">
      <div style="font-size:14px;font-weight:700;color:#312e81;">${escapeHtml(name)}</div>
      <div style="font-size:13px;line-height:1.45;color:#475569;margin-top:2px;">${escapeHtml(detail)}</div>
    </td></tr>`
  )).join('<tr><td style="height:8px;"></td></tr>');
  const text = [
    `Hi ${greeting},`,
    '',
    'Welcome to NET360 — Your Smart NET Preparation Platform.',
    '',
    'Your account is ready. Here is what you can use:',
    '',
    featureText,
    '',
    url,
    '',
    '— NET360 Preparation',
  ].join('\n');
  const html = notificationShell({
    title: 'Welcome to NET360 — Your Smart NET Preparation Platform',
    greeting: escapeHtml(greeting),
    paragraphs: [
      'Your account is ready. NET360 brings your preparation into one place.',
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${featureHtml}</table>`,
    ],
    ctaLabel: 'Open NET360',
    ctaUrl: escapeHtml(url),
    footer: 'This welcome is sent once, only when your NET360 account is created.',
  });
  return { subject: WELCOME_EMAIL_SUBJECT, text, html };
}

export async function sendWelcomeEmailOnce(user, deps = {}) {
  if (!user?._id || user.role === 'admin' || user.welcomeEmailSent !== false) {
    return { status: 'skipped' };
  }
  const users = deps.users || UserModel;
  const send = deps.send || ((message) => sendTransactionalEmail(message, { brevoOnly: true }));
  const claimed = await users.findOneAndUpdate(
    { _id: user._id, role: { $ne: 'admin' }, welcomeEmailSent: false },
    { $set: { welcomeEmailSent: true, welcomeEmailSentAt: new Date() } },
    { new: false },
  );
  if (!claimed) return { status: 'skipped', reason: 'already-sent-or-existing' };
  const message = buildWelcomeEmail({ firstName: claimed.firstName || user.firstName });
  try {
    const result = await send({
      to: String(claimed.email || user.email || '').trim().toLowerCase(),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { status: 'sent', provider: result?.provider || '' };
  } catch (error) {
    await users.updateOne(
      { _id: user._id, welcomeEmailSent: true },
      { $set: { welcomeEmailSent: false }, $unset: { welcomeEmailSentAt: '' } },
    );
    throw error;
  }
}

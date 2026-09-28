import { UserModel } from '../models/User.js';
import { UserNotificationModel } from '../models/UserNotification.js';
import { claimCommunityNotificationDelivery } from './communityNotifications.js';
import { notificationShell } from '../services/notificationEmail.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendResendEmail({ to, subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return;
  const from = String(process.env.RESEND_FROM_EMAIL || '').trim() || 'NET360 <beth.t@example.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${body.slice(0, 180)}`);
  }
}

function publicWebBase() {
  return String(process.env.NET360_PUBLIC_WEB_BASE || process.env.PUBLIC_WEB_BASE_URL || 'https://net360preparation.com')
    .replace(/\/$/, '');
}

export function videoWatchLink(video) {
  const params = new URLSearchParams();
  if (video?.sectionId) params.set('sectionId', String(video.sectionId));
  if (video?._id) params.set('videoId', String(video._id));
  return `${publicWebBase()}/videos?${params.toString()}`;
}

export async function notifyVideoPublished(video) {
  const sectionLabel = String(video.section || '').trim();
  const subjectLabel = String(video.subject || video.subjectId || '').trim();
  const title = 'New video available';
  const body = `A new ${subjectLabel} video has been added to ${sectionLabel}.`;
  const link = videoWatchLink(video);
  const eventKey = `video.published:${String(video._id)}`;

  const cursor = UserModel.find({ role: 'student' })
    .select('_id email firstName preferences requiresEmailVerification emailVerifiedAt')
    .lean()
    .cursor();

  for await (const user of cursor) {
    const prefs = user.preferences || {};
    const contentOk = prefs.contentUpdates !== false;
    if (!contentOk) continue;

    const claimed = await claimCommunityNotificationDelivery(eventKey, user._id, user.email);
    if (!claimed) continue;

    await UserNotificationModel.create({
      userId: user._id,
      kind: 'video.published',
      title,
      body,
      link: `/videos?sectionId=${encodeURIComponent(String(video.sectionId || ''))}&videoId=${encodeURIComponent(String(video._id || ''))}`,
      videoId: String(video._id || ''),
      sectionId: String(video.sectionId || ''),
    });

    if (prefs.emailNotifications === false) continue;
    if (user.requiresEmailVerification === true && !user.emailVerifiedAt) continue;
    const dest = normalizeEmail(user.email);
    if (!dest) continue;
    const greeting = String(user.firstName || '').trim() || 'there';
    const paragraphs = [
      body,
      'Open NET360 to watch the lecture in the Videos section.',
    ];
    try {
      await sendResendEmail({
        to: dest,
        subject: title,
        text: `Hi ${greeting},\n\n${paragraphs.join('\n')}\n\n${link}\n`,
        html: notificationShell({
          title,
          greeting: escapeHtml(greeting),
          paragraphs: paragraphs.map((item) => escapeHtml(item)),
          ctaLabel: 'Watch video',
          ctaUrl: escapeHtml(link),
          footer: 'You received this because content updates are enabled in your NET360 preferences.',
        }),
      });
    } catch (error) {
      console.warn('[videos] publish email failed:', error?.message || error);
    }
  }
}

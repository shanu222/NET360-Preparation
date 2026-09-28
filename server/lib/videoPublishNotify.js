import { UserModel } from '../models/User.js';
import { VideoModel } from '../models/Video.js';
import { notificationShell } from '../services/notificationEmail.js';
import { sendTransactionalEmail } from './outboundEmail.js';
import { wantsVideoNotification } from './videoNotificationPreference.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function publicWebBase() {
  return String(process.env.NET360_PUBLIC_WEB_BASE || process.env.PUBLIC_WEB_BASE_URL || 'https://www.net360preparation.com')
    .replace(/\/$/, '');
}

export function videoWatchLink(video) {
  const params = new URLSearchParams();
  if (video?.sectionId) params.set('sectionId', String(video.sectionId));
  if (video?._id) params.set('videoId', String(video._id));
  return `${publicWebBase()}/videos?${params.toString()}`;
}

function locationPath(video) {
  return [video.subject, video.part, video.chapter, video.section, video.topic]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' → ');
}

/**
 * Claims the one-time publication email campaign. Returns the updated video or null if another
 * request already claimed it, or if this is not a first-time publish.
 */
export async function claimVideoPublicationEmail(video) {
  if (!video?._id) return null;
  if (String(video.status || '') !== 'published') return null;
  const now = new Date();
  return VideoModel.findOneAndUpdate(
    {
      _id: video._id,
      status: 'published',
      publicationNotificationSent: { $ne: true },
      $and: [
        {
          $or: [
            { publishedNotifySentAt: null },
            { publishedNotifySentAt: { $exists: false } },
          ],
        },
        {
          $or: [
            { publishedAt: null },
            { publishedAt: { $exists: false } },
          ],
        },
      ],
    },
    {
      $set: {
        publicationNotificationSent: true,
        publicationNotificationSentAt: now,
        publishedNotifySentAt: now,
        publishedAt: now,
      },
    },
    { new: true },
  );
}

export async function deliverVideoPublicationEmails(video, options = {}) {
  const title = String(video?.title || 'New lecture').trim() || 'New lecture';
  const pathLabel = locationPath(video) || 'Videos';
  const subjectLine = `New Video Available — ${title}`;
  const announcement = `${title} is now available in ${pathLabel}.`;
  const link = videoWatchLink(video);
  const send = options.send || sendTransactionalEmail;
  const alreadySentUserIds = options.alreadySentUserIds || new Set();
  const users = options.users || UserModel.find({})
    .select('_id email firstName preferences')
    .lean()
    .cursor();

  for await (const user of users) {
    const userId = String(user?._id || '');
    if (!userId || alreadySentUserIds.has(userId)) continue;
    const dest = normalizeEmail(user.email);
    if (!dest || !isValidEmail(dest)) {
      console.warn('[videos] publication email skipped: invalid or missing address', userId);
      continue;
    }
    if (!wantsVideoNotification(user.preferences)) continue;
    alreadySentUserIds.add(userId);

    const greeting = String(user.firstName || '').trim() || 'there';
    try {
      await send({
        to: dest,
        subject: subjectLine,
        text: `Hi ${greeting},\n\n${announcement}\n\nWatch it here:\n${link}\n`,
        html: notificationShell({
          title: escapeHtml(subjectLine),
          greeting: escapeHtml(greeting),
          paragraphs: [escapeHtml(announcement)],
          ctaLabel: 'Watch lecture',
          ctaUrl: escapeHtml(link),
          footer: 'You received this because Video Notifications are enabled on your NET360 account. Only this new upload is included.',
        }),
      });
    } catch (error) {
      alreadySentUserIds.delete(userId);
      console.warn('[videos] publication email failed:', dest, error instanceof Error ? error.message : 'unknown');
    }
  }
}

export async function notifyVideoPublished(video) {
  const claimed = await claimVideoPublicationEmail(video);
  if (!claimed) return;
  await deliverVideoPublicationEmails(claimed);
}

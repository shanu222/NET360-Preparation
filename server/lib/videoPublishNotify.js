import mongoose from 'mongoose';
import { UserModel } from '../models/User.js';
import { VideoModel } from '../models/Video.js';
import { VideoEmailReceiptModel } from '../models/VideoEmailReceipt.js';
import { UserNotificationModel } from '../models/UserNotification.js';

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

export function videoInboxLink(video) {
  const params = new URLSearchParams();
  if (video?.sectionId) params.set('sectionId', String(video.sectionId));
  if (video?._id) params.set('videoId', String(video._id));
  const query = params.toString();
  return query ? `/videos?${query}` : '/videos';
}

export async function recordVideoInboxNotification(user, video, announcement) {
  if (mongoose.connection.readyState !== 1) return;
  const userId = String(user?._id || '');
  const videoId = String(video?._id || '');
  if (!userId || !videoId) return;
  const title = String(video?.title || 'New lecture').trim() || 'New lecture';
  await UserNotificationModel.updateOne(
    { userId, kind: 'video.published', videoId },
    {
      $setOnInsert: {
        userId,
        kind: 'video.published',
        videoId,
        sectionId: String(video?.sectionId || ''),
        title: `New video: ${title}`,
        body: String(announcement || `${title} is now available.`),
        link: videoInboxLink(video),
        readAt: null,
      },
    },
    { upsert: true },
  );
}

function locationPath(video) {
  return [video.subject, video.part, video.chapter, video.section, video.topic]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' → ');
}

export function shouldStartVideoPublicationCampaign(previousStatus, nextStatus) {
  if (String(nextStatus || '') !== 'published') return false;
  const previous = String(previousStatus || '').trim().toLowerCase();
  return previous !== 'published' && previous !== 'unpublished' && previous !== 'disabled';
}

/**
 * Starts the one-time campaign for a newly published video.
 * A campaign that already started but did not finish can be continued.
 * A finished campaign, or a video that was never started, is not reopened.
 */
export async function claimVideoPublicationEmail(video) {
  if (!video?._id) return null;
  if (String(video.status || '') !== 'published') return null;
  const existing = await VideoModel.findById(video._id)
    .select('status publicationNotificationSent publicationNotificationStartedAt publishedAt')
    .lean();
  if (!existing || existing.status !== 'published') return null;
  if (existing.publicationNotificationSent === true) return null;
  if (existing.publicationNotificationStartedAt) return VideoModel.findById(video._id);
  const now = new Date();
  return VideoModel.findOneAndUpdate(
    {
      _id: video._id,
      status: 'published',
      publicationNotificationSent: { $ne: true },
      $or: [
        { publicationNotificationStartedAt: null },
        { publicationNotificationStartedAt: { $exists: false } },
      ],
    },
    {
      $set: {
        publicationNotificationStartedAt: now,
        publishedAt: existing.publishedAt || now,
      },
    },
    { new: true },
  );
}

async function markCampaignComplete(videoId) {
  const now = new Date();
  await VideoModel.updateOne(
    { _id: videoId, publicationNotificationSent: { $ne: true } },
    {
      $set: {
        publicationNotificationSent: true,
        publicationNotificationSentAt: now,
        publishedNotifySentAt: now,
      },
    },
  );
}

function mongoReceipts() {
  return {
    async find(eventId) {
      return VideoEmailReceiptModel.findOne({ eventId }).lean();
    },
    async save(receipt) {
      await VideoEmailReceiptModel.updateOne(
        { eventId: receipt.eventId },
        { $set: receipt },
        { upsert: true },
      );
    },
  };
}

export async function deliverVideoPublicationEmails(video, options = {}) {
  const title = String(video?.title || 'New lecture').trim() || 'New lecture';
  const pathLabel = locationPath(video) || 'Videos';
  const announcement = `${title} is now available in ${pathLabel}.`;
  const receipts = options.receipts || mongoReceipts();
  const recordInbox = options.recordInbox || recordVideoInboxNotification;
  const users = options.users || UserModel.find({ role: { $ne: 'admin' } })
    .select('_id email firstName role preferences')
    .lean()
    .cursor();
  const summary = { sent: 0, skipped: 0, failed: 0 };

  for await (const user of users) {
    const userId = String(user?._id || '');
    if (!userId || (user.role || 'student') === 'admin') continue;
    const eventId = `video-published:${video._id}:${userId}`;
    await recordInbox(user, video, announcement).catch(() => undefined);
    const existing = await receipts.find(eventId);
    if (existing?.status === 'sent' || existing?.status === 'skipped') {
      summary.skipped += 1;
      continue;
    }
    await receipts.save({
      eventId,
      videoId: String(video._id),
      userId,
      status: 'skipped',
      provider: '',
      error: 'video-email-disabled',
    });
    summary.skipped += 1;
  }
  return summary;
}

export async function notifyVideoPublished(video, options = {}) {
  const claim = options.claim || claimVideoPublicationEmail;
  const claimed = await claim(video);
  if (!claimed) return { status: 'not-claimed', sent: 0, skipped: 0, failed: 0 };
  const summary = await deliverVideoPublicationEmails(claimed, options);
  if (summary.failed === 0) {
    if (options.complete) await options.complete(claimed._id);
    else await markCampaignComplete(claimed._id);
    return { status: 'complete', ...summary };
  }
  return { status: 'retry', ...summary };
}

export async function retryIncompleteVideoPublicationEmails() {
  const videos = await VideoModel.find({
    status: 'published',
    publicationNotificationStartedAt: { $type: 'date' },
    publicationNotificationSent: { $ne: true },
  }).sort({ publicationNotificationStartedAt: 1 }).limit(3);
  const results = [];
  for (const video of videos) {
    results.push(await notifyVideoPublished(video));
  }
  return results;
}

import { CommunityNotificationDeliveryModel } from '../models/CommunityNotificationDelivery.js';
import { ChatNotificationWindowModel } from '../models/ChatNotificationWindow.js';
import { getRedisMain } from '../services/redis.js';

const localClaimedDeliveryIds = new Set();
const NOTIFY_DEDUP_TTL_SEC = 90 * 24 * 60 * 60;
export const CHAT_NOTIFY_WINDOW_MS = 30 * 60 * 1000;

export const COMMUNITY_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_NOTIFY_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export const COMMUNITY_FILE_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function communityNotifyEventKey(kind, entityId, extra = '') {
  const parts = [String(kind || '').trim(), String(entityId || '').trim()];
  const suffix = String(extra || '').trim();
  if (suffix) parts.push(suffix);
  return parts.filter(Boolean).join(':');
}

export const communityNotifyEvent = {
  connectionRequest: (requestId) => communityNotifyEventKey('connection.request', requestId),
  connectionResponse: (requestId, status) => communityNotifyEventKey('connection.response', requestId, status),
  quizInvite: (challengeId) => communityNotifyEventKey('quiz.invite', challengeId),
  quizResponse: (challengeId, action) => communityNotifyEventKey('quiz.response', challengeId, action),
  quizResult: (challengeId) => communityNotifyEventKey('quiz.result', challengeId),
  badgeUnlock: (badgeId) => communityNotifyEventKey('badge.unlock', badgeId),
  communityMessage: (messageId) => communityNotifyEventKey('community.message', messageId),
  supportUserMessage: (messageId) => communityNotifyEventKey('support.user-message', messageId),
  supportAdminReply: (messageId) => communityNotifyEventKey('support.admin-reply', messageId),
  communityChatWindow: (connectionId, recipientId, notifiedAtMs) => (
    communityNotifyEventKey('community.chat-window', connectionId, `${recipientId}:${notifiedAtMs}`)
  ),
  supportUserWindow: (userId, notifiedAtMs) => communityNotifyEventKey('support.user-window', userId, notifiedAtMs),
  supportAdminWindow: (userId, notifiedAtMs) => communityNotifyEventKey('support.admin-window', userId, notifiedAtMs),
};

export function communityChatWindowKey(connectionId, recipientId) {
  return `community:${String(connectionId || '').trim()}:to:${String(recipientId || '').trim()}`;
}

export function supportChatWindowKey(userId, toward) {
  const side = String(toward || '').trim() === 'admin' ? 'admin' : 'user';
  return `support:${String(userId || '').trim()}:to:${side}`;
}

export function shouldSendChatWindowNotification(window, now = Date.now()) {
  if (!window?.lastNotifiedAt) return true;
  const lastNotified = new Date(window.lastNotifiedAt).getTime();
  if (!Number.isFinite(lastNotified)) return true;
  const lastReply = window.lastReplyAt ? new Date(window.lastReplyAt).getTime() : 0;
  if (Number.isFinite(lastReply) && lastReply >= lastNotified) return true;
  return now - lastNotified >= CHAT_NOTIFY_WINDOW_MS;
}

export function isRecentCommunityEvent(value, now = Date.now(), lookbackMs = COMMUNITY_NOTIFY_LOOKBACK_MS) {
  if (!value) return false;
  const at = new Date(value).getTime();
  return Number.isFinite(at) && now - at <= lookbackMs;
}

export function sniffCommunityFileKind(buffer) {
  if (!buffer || buffer.length < 4) return '';
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (
    buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  const head = buffer.slice(0, 80).toString('utf8').trim().toLowerCase();
  if (
    head.startsWith('<!doctype')
    || head.startsWith('<html')
    || head.startsWith('<script')
    || head.startsWith('<svg')
  ) {
    return 'unsafe';
  }
  return '';
}

export function communityFileMimeMatchesKind(mimeType, kind) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (kind === 'pdf') return mime === 'application/pdf' || mime === 'application/x-pdf';
  if (kind === 'jpeg') return mime === 'image/jpeg' || mime === 'image/jpg';
  if (kind === 'png') return mime === 'image/png';
  if (kind === 'webp') return mime === 'image/webp';
  return false;
}

export function safeCommunityAttachmentContentType(mimeType, kind) {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'jpeg') return 'image/jpeg';
  if (kind === 'png') return 'image/png';
  if (kind === 'webp') return 'image/webp';
  const mime = String(mimeType || '').trim().toLowerCase();
  if (COMMUNITY_FILE_ALLOWED_MIME_TYPES.has(mime)) {
    return mime === 'image/jpg' ? 'image/jpeg' : mime === 'application/x-pdf' ? 'application/pdf' : mime;
  }
  return 'application/octet-stream';
}

export function notificationRecipientKey(userId, email) {
  const dest = String(email || '').trim().toLowerCase();
  if (dest) return dest;
  return String(userId || '').trim().toLowerCase();
}

export function buildNotificationDeliveryId(eventKey, userId, email) {
  const key = String(eventKey || '').trim();
  const recipient = notificationRecipientKey(userId, email);
  if (!key || !recipient) return '';
  return `${key}::${recipient}`;
}

export function tryReserveLocalDeliveryId(deliveryId) {
  const id = String(deliveryId || '').trim();
  if (!id) return false;
  if (localClaimedDeliveryIds.has(id)) return false;
  localClaimedDeliveryIds.add(id);
  return true;
}

async function reserveRedisDeliveryId(deliveryId) {
  try {
    const redis = await getRedisMain();
    if (!redis?.isReady) return 'skipped';
    const reserved = await redis.set(`notify:once:${deliveryId}`, '1', { NX: true, EX: NOTIFY_DEDUP_TTL_SEC });
    return reserved === 'OK' ? 'claimed' : 'exists';
  } catch {
    return 'skipped';
  }
}

export async function claimCommunityNotificationDelivery(eventKey, userId, email = '') {
  const key = String(eventKey || '').trim();
  const uid = String(userId || '').trim();
  const dest = String(email || '').trim().toLowerCase();
  const deliveryId = buildNotificationDeliveryId(key, uid, dest);
  if (!deliveryId) return false;
  if (!tryReserveLocalDeliveryId(deliveryId)) return false;

  const redisState = await reserveRedisDeliveryId(deliveryId);
  if (redisState === 'exists') return false;

  try {
    const existingQuery = {
      $or: [
        { deliveryId },
        { eventKey: key, userId: uid },
      ],
    };
    if (dest) {
      existingQuery.$or.push({ eventKey: key, recipientEmail: dest });
    }
    const existing = await CommunityNotificationDeliveryModel.findOne(existingQuery).select('_id').lean();
    if (existing) return false;

    const result = await CommunityNotificationDeliveryModel.findOneAndUpdate(
      { deliveryId },
      {
        $setOnInsert: {
          deliveryId,
          eventKey: key,
          userId: uid || dest,
          recipientEmail: dest,
          sentAt: new Date(),
        },
      },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    if (result?.lastErrorObject?.updatedExisting) return false;
    return true;
  } catch (error) {
    if (error && error.code === 11000) return false;
    console.warn('[notify] delivery claim failed:', error?.message || error);
    return false;
  }
}

async function clearRedisChatWindow(windowKey) {
  try {
    const redis = await getRedisMain();
    if (!redis?.isReady) return;
    await redis.del(`notify:chat-window:${windowKey}`);
  } catch {
    // Mongo window state remains the source of truth.
  }
}

async function stampRedisChatWindow(windowKey, notifiedAtMs) {
  try {
    const redis = await getRedisMain();
    if (!redis?.isReady) return;
    await redis.set(
      `notify:chat-window:${windowKey}`,
      String(notifiedAtMs),
      { EX: Math.ceil(CHAT_NOTIFY_WINDOW_MS / 1000) },
    );
  } catch {
    // Mongo window state remains the source of truth.
  }
}

export async function markChatNotificationSpeaker(windowKey) {
  const key = String(windowKey || '').trim();
  if (!key) return;
  const now = new Date();
  await ChatNotificationWindowModel.updateOne(
    { windowKey: key },
    { $set: { lastReplyAt: now }, $setOnInsert: { windowKey: key, lastNotifiedAt: null } },
    { upsert: true },
  );
  await clearRedisChatWindow(key);
}

export async function claimChatNotificationWindow(windowKey) {
  const key = String(windowKey || '').trim();
  if (!key) return { allowed: false, notifiedAtMs: 0 };
  const now = new Date();
  const nowMs = now.getTime();

  let doc = await ChatNotificationWindowModel.findOne({ windowKey: key });
  if (!doc) {
    try {
      doc = await ChatNotificationWindowModel.create({
        windowKey: key,
        lastNotifiedAt: now,
        lastReplyAt: null,
      });
      await stampRedisChatWindow(key, nowMs);
      return { allowed: true, notifiedAtMs: nowMs };
    } catch (error) {
      if (!error || error.code !== 11000) {
        console.warn('[notify] chat window create failed:', error?.message || error);
        return { allowed: false, notifiedAtMs: 0 };
      }
      doc = await ChatNotificationWindowModel.findOne({ windowKey: key });
    }
  }

  if (!doc || !shouldSendChatWindowNotification(doc, nowMs)) {
    return { allowed: false, notifiedAtMs: 0 };
  }

  const previousNotifiedAt = doc.lastNotifiedAt || null;
  const updated = await ChatNotificationWindowModel.findOneAndUpdate(
    {
      windowKey: key,
      lastNotifiedAt: previousNotifiedAt,
    },
    { $set: { lastNotifiedAt: now } },
    { new: true },
  );
  if (!updated) return { allowed: false, notifiedAtMs: 0 };

  await stampRedisChatWindow(key, nowMs);
  return { allowed: true, notifiedAtMs: nowMs };
}

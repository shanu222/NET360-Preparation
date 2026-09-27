import { CommunityNotificationDeliveryModel } from '../models/CommunityNotificationDelivery.js';

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
};

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

export async function claimCommunityNotificationDelivery(eventKey, userId) {
  const key = String(eventKey || '').trim();
  const uid = String(userId || '').trim();
  if (!key || !uid) return false;
  try {
    await CommunityNotificationDeliveryModel.create({
      eventKey: key,
      userId: uid,
      sentAt: new Date(),
    });
    return true;
  } catch (error) {
    if (error && error.code === 11000) return false;
    throw error;
  }
}

import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { AnalyticsSessionModel } from '../models/AnalyticsSession.js';
import { AnalyticsEventModel } from '../models/AnalyticsEvent.js';
import { AnalyticsErrorModel } from '../models/AnalyticsError.js';
import { AnalyticsAlertModel } from '../models/AnalyticsAlert.js';
import { AnalyticsDailyReportModel } from '../models/AnalyticsDailyReport.js';
import { getRedisMain } from '../services/redis.js';

export const ANALYTICS_ALERT_WINDOW_MS = 30 * 60 * 1000;
export const ANALYTICS_HEARTBEAT_MIN_MS = 45 * 1000;
export const ANALYTICS_SESSION_IDLE_MS = 30 * 60 * 1000;

export const ANALYTICS_PLATFORMS = new Set(['web', 'android', 'ios']);

export const ANALYTICS_FEATURES = new Set([
  'HOME',
  'PROFILE',
  'TESTS',
  'PRACTICE_BOARD',
  'PREPARATION_MATERIALS',
  'PROGRAMS',
  'COMMUNITY',
  'QUIZ_BATTLE',
  'PERFORMANCE_ANALYTICS',
  'NUST_ADMISSION_GUIDE',
  'TARGET_PROGRAM',
  'SUPPORT_CHAT',
]);

export const ANALYTICS_EVENT_TYPES = new Set([
  'session_start',
  'session_activity',
  'session_end',
  'screen_open',
  'feature_usage',
  'technical_error',
  'api_error',
  'authentication_error',
]);

export const ANALYTICS_ERROR_CATEGORIES = new Set([
  'AUTHENTICATION',
  'REGISTRATION',
  'EMAIL_VERIFICATION',
  'API',
  'TEST',
  'PRACTICE_BOARD',
  'COMMUNITY',
  'CHAT',
  'QUIZ_BATTLE',
  'PDF',
  'NUST_ADMISSIONS',
  'PAYMENT',
  'ANDROID',
  'IOS',
  'WEB',
  'GENERAL',
]);

const ALERTABLE_CATEGORIES = new Set([
  'AUTHENTICATION',
  'REGISTRATION',
  'EMAIL_VERIFICATION',
  'TEST',
  'PRACTICE_BOARD',
  'COMMUNITY',
  'CHAT',
  'QUIZ_BATTLE',
  'PDF',
  'NUST_ADMISSIONS',
  'PAYMENT',
]);

const EVENT_TYPE_TO_CATEGORY = {
  login_failed: 'AUTHENTICATION',
  google_auth_failed: 'AUTHENTICATION',
  registration_failed: 'REGISTRATION',
  email_verification_failed: 'EMAIL_VERIFICATION',
  test_launch_failed: 'TEST',
  practice_board_failed: 'PRACTICE_BOARD',
  community_connection_failed: 'COMMUNITY',
  chat_realtime_failed: 'CHAT',
  quiz_battle_failed: 'QUIZ_BATTLE',
  pdf_failed: 'PDF',
  nust_feed_failed: 'NUST_ADMISSIONS',
  api_failed: 'API',
  payment_failed: 'PAYMENT',
};

const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9._\-]+/gi,
  /eyj[a-z0-9_\-]{10,}\.[a-z0-9_\-]{10,}\.[a-z0-9_\-]{10,}/gi,
  /re_[a-z0-9_]+/gi,
  /mongodb(\+srv)?:\/\/[^\s]+/gi,
  /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /authorization["']?\s*[:=]\s*["']?[^"'\s]+/gi,
];

export function sanitizeAnalyticsText(value, max = 240) {
  let text = String(value || '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeAnalyticsPlatform(value, headerValue = '') {
  const raw = String(value || headerValue || '').trim().toLowerCase();
  if (raw === 'android' || raw === 'android-native') return 'android';
  if (raw === 'ios' || raw === 'ios-native') return 'ios';
  if (raw === 'web' || raw === 'admin-web') return 'web';
  return 'web';
}

export function normalizeAnalyticsFeature(value, screen = '') {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (ANALYTICS_FEATURES.has(raw)) return raw;
  const fromScreen = String(screen || '').trim().toLowerCase();
  const map = {
    home: 'HOME',
    profile: 'PROFILE',
    tests: 'TESTS',
    'practice-board': 'PRACTICE_BOARD',
    preparation: 'PREPARATION_MATERIALS',
    programs: 'PROGRAMS',
    community: 'COMMUNITY',
    analytics: 'PERFORMANCE_ANALYTICS',
    guide: 'NUST_ADMISSION_GUIDE',
    subscription: 'TARGET_PROGRAM',
  };
  return map[fromScreen] || '';
}

export function normalizeErrorCategory(eventType, category) {
  const explicit = String(category || '').trim().toUpperCase();
  if (ANALYTICS_ERROR_CATEGORIES.has(explicit)) return explicit;
  return EVENT_TYPE_TO_CATEGORY[String(eventType || '').trim()] || 'GENERAL';
}

export function buildAnalyticsAlertKey({ platform, userId, eventType, resource, at = Date.now() }) {
  const bucket = Math.floor(Number(at) / ANALYTICS_ALERT_WINDOW_MS);
  return [
    String(platform || 'web'),
    String(userId || 'anonymous'),
    String(eventType || 'unknown'),
    String(resource || 'none'),
    String(bucket),
  ].join(':');
}

export function buildDailyReportId(dateKey) {
  return `NET360-DAILY-REPORT-${String(dateKey || '').trim()}`;
}

export function pakistanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function pakistanDayRange(dateKey) {
  const start = new Date(`${dateKey}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function shouldAlertOnError({ category, statusCode, eventType }) {
  if (ALERTABLE_CATEGORIES.has(category)) return true;
  if (category === 'API' && Number(statusCode) >= 500) return true;
  if (category === 'API' && String(eventType || '').includes('timeout')) return true;
  return false;
}

export function newAnalyticsId(prefix = 'evt') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function upsertAnalyticsSession(input) {
  const sessionId = String(input.sessionId || '').trim() || newAnalyticsId('ses');
  const now = input.at instanceof Date ? input.at : new Date();
  const platform = normalizeAnalyticsPlatform(input.platform, input.headerPlatform);
  const userId = String(input.userId || '').trim();
  const anonymousId = String(input.anonymousId || '').trim();
  const appVersion = sanitizeAnalyticsText(input.appVersion, 32);
  const osVersion = sanitizeAnalyticsText(input.osVersion, 32);
  const action = String(input.action || 'start').trim();

  const existing = await AnalyticsSessionModel.findOne({ sessionId }).lean();
  if (existing) {
    const last = existing.lastActivityAt ? new Date(existing.lastActivityAt).getTime() : 0;
    const started = existing.startedAt ? new Date(existing.startedAt).getTime() : now.getTime();
    const shouldTouch = action === 'end' || !last || (now.getTime() - last) >= ANALYTICS_HEARTBEAT_MIN_MS;
    if (!shouldTouch && action !== 'end') {
      return existing;
    }
    const endedAt = action === 'end' ? now : existing.endedAt;
    const durationMs = Math.max(0, (endedAt ? new Date(endedAt).getTime() : now.getTime()) - started);
    await AnalyticsSessionModel.updateOne(
      { sessionId },
      {
        $set: {
          lastActivityAt: now,
          endedAt: endedAt || null,
          durationMs,
          ...(userId ? { userId } : {}),
          ...(appVersion ? { appVersion } : {}),
          ...(osVersion ? { osVersion } : {}),
        },
      },
    );
    return { ...existing, lastActivityAt: now, endedAt, durationMs, userId: userId || existing.userId };
  }

  const created = await AnalyticsSessionModel.create({
    sessionId,
    userId,
    anonymousId,
    platform,
    appVersion,
    osVersion,
    startedAt: now,
    lastActivityAt: now,
    endedAt: action === 'end' ? now : null,
    durationMs: 0,
  });
  return created.toObject();
}

export async function recordAnalyticsEvent(input) {
  const eventType = String(input.eventType || 'feature_usage').trim();
  if (!ANALYTICS_EVENT_TYPES.has(eventType) && !EVENT_TYPE_TO_CATEGORY[eventType]) {
    return null;
  }
  const eventId = String(input.eventId || '').trim() || newAnalyticsId('evt');
  try {
    await AnalyticsEventModel.create({
      eventId,
      sessionId: String(input.sessionId || '').trim(),
      userId: String(input.userId || '').trim(),
      anonymousId: String(input.anonymousId || '').trim(),
      platform: normalizeAnalyticsPlatform(input.platform, input.headerPlatform),
      appVersion: sanitizeAnalyticsText(input.appVersion, 32),
      screen: sanitizeAnalyticsText(input.screen, 64),
      feature: normalizeAnalyticsFeature(input.feature, input.screen),
      eventType: ANALYTICS_EVENT_TYPES.has(eventType) ? eventType : 'feature_usage',
      timestamp: input.at instanceof Date ? input.at : new Date(),
    });
  } catch (error) {
    if (String(error?.code) === '11000') return { eventId, duplicate: true };
    throw error;
  }
  return { eventId };
}

export async function claimAnalyticsAlert(deduplicationKey) {
  const key = String(deduplicationKey || '').trim();
  if (!key) return false;
  try {
    const redis = getRedisMain();
    if (redis) {
      const reserved = await redis.set(`analytics:alert:${key}`, '1', 'EX', Math.ceil(ANALYTICS_ALERT_WINDOW_MS / 1000), 'NX');
      if (reserved !== 'OK' && reserved !== true) return false;
    }
  } catch {
    // Mongo unique index remains the source of truth.
  }
  try {
    await AnalyticsAlertModel.create({ deduplicationKey: key });
    return true;
  } catch (error) {
    if (String(error?.code) === '11000') return false;
    throw error;
  }
}

export async function recordAnalyticsError(input) {
  const eventType = String(input.eventType || 'technical_error').trim();
  const category = normalizeErrorCategory(eventType, input.category);
  const eventId = String(input.eventId || '').trim() || newAnalyticsId('err');
  const userId = String(input.userId || '').trim();
  const platform = normalizeAnalyticsPlatform(input.platform, input.headerPlatform);
  const resource = sanitizeAnalyticsText(input.resource || input.screen, 80);
  const statusCode = Number(input.statusCode || 0);
  const doc = {
    eventId,
    sessionId: String(input.sessionId || '').trim(),
    userId,
    anonymousId: String(input.anonymousId || '').trim(),
    platform,
    appVersion: sanitizeAnalyticsText(input.appVersion, 32),
    osVersion: sanitizeAnalyticsText(input.osVersion, 32),
    screen: sanitizeAnalyticsText(input.screen, 64),
    category,
    eventType,
    errorCode: sanitizeAnalyticsText(input.errorCode, 80),
    message: sanitizeAnalyticsText(input.message, 240),
    resource,
    statusCode: Number.isFinite(statusCode) ? statusCode : 0,
    timestamp: input.at instanceof Date ? input.at : new Date(),
  };

  try {
    await AnalyticsErrorModel.create(doc);
  } catch (error) {
    if (String(error?.code) !== '11000') throw error;
  }

  const alert = shouldAlertOnError({ category, statusCode, eventType })
    ? {
      key: buildAnalyticsAlertKey({
        platform,
        userId,
        eventType,
        resource,
        at: doc.timestamp.getTime(),
      }),
      payload: doc,
    }
    : null;

  return { eventId, alert };
}

export async function aggregateAnalyticsOverview(now = new Date()) {
  const todayKey = pakistanDateKey(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = pakistanDateKey(yesterday);
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const today = pakistanDayRange(todayKey);
  const yday = pakistanDayRange(yesterdayKey);
  const month = { start: pakistanDayRange(monthStartKey).start, end: today.end };

  const activeCutoff = new Date(now.getTime() - ANALYTICS_SESSION_IDLE_MS);
  const [activeNow, todayStats, yesterdayStats, monthStats, recentErrors] = await Promise.all([
    AnalyticsSessionModel.countDocuments({ lastActivityAt: { $gte: activeCutoff }, endedAt: null }),
    summarizeRange(today.start, today.end),
    summarizeRange(yday.start, yday.end),
    summarizeRange(month.start, month.end),
    AnalyticsErrorModel.find({ timestamp: { $gte: today.start } }).sort({ timestamp: -1 }).limit(25).lean(),
  ]);

  return {
    generatedAt: now.toISOString(),
    activeNow,
    today: todayStats,
    yesterday: yesterdayStats,
    month: monthStats,
    recentErrors: recentErrors.map((item) => ({
      eventType: item.eventType,
      category: item.category,
      platform: item.platform,
      screen: item.screen,
      errorCode: item.errorCode,
      message: item.message,
      timestamp: item.timestamp,
    })),
  };
}

async function summarizeRange(start, end) {
  const [sessions, events, errors, newUsers] = await Promise.all([
    AnalyticsSessionModel.find({ startedAt: { $gte: start, $lt: end } }).lean(),
    AnalyticsEventModel.find({ timestamp: { $gte: start, $lt: end }, eventType: { $in: ['screen_open', 'feature_usage'] } }).lean(),
    AnalyticsErrorModel.find({ timestamp: { $gte: start, $lt: end } }).lean(),
    countNewUsers(start, end),
  ]);

  const uniqueUsers = new Set();
  const platforms = { web: 0, android: 0, ios: 0 };
  let durationMs = 0;
  sessions.forEach((session) => {
    const who = session.userId || session.anonymousId;
    if (who) uniqueUsers.add(String(who));
    const platform = normalizeAnalyticsPlatform(session.platform);
    platforms[platform] = (platforms[platform] || 0) + 1;
    const startMs = session.startedAt ? new Date(session.startedAt).getTime() : 0;
    const endMs = session.endedAt
      ? new Date(session.endedAt).getTime()
      : (session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : startMs);
    durationMs += Math.max(0, endMs - startMs);
  });

  const features = {};
  events.forEach((event) => {
    const feature = event.feature || normalizeAnalyticsFeature('', event.screen) || 'OTHER';
    features[feature] = (features[feature] || 0) + 1;
  });

  const errorCounts = {
    login: 0,
    api: 0,
    tests: 0,
    practiceBoard: 0,
    pdf: 0,
    community: 0,
    nust: 0,
    other: 0,
  };
  errors.forEach((error) => {
    if (error.category === 'AUTHENTICATION' || error.category === 'REGISTRATION' || error.category === 'EMAIL_VERIFICATION') errorCounts.login += 1;
    else if (error.category === 'API') errorCounts.api += 1;
    else if (error.category === 'TEST') errorCounts.tests += 1;
    else if (error.category === 'PRACTICE_BOARD') errorCounts.practiceBoard += 1;
    else if (error.category === 'PDF') errorCounts.pdf += 1;
    else if (error.category === 'COMMUNITY' || error.category === 'CHAT') errorCounts.community += 1;
    else if (error.category === 'NUST_ADMISSIONS') errorCounts.nust += 1;
    else errorCounts.other += 1;
  });

  return {
    activeUsers: uniqueUsers.size,
    newUsers,
    returningUsers: Math.max(0, uniqueUsers.size - newUsers),
    sessions: sessions.length,
    totalUsageMs: durationMs,
    averageSessionMs: sessions.length ? Math.round(durationMs / sessions.length) : 0,
    platforms,
    features,
    errors: errorCounts,
  };
}

async function countNewUsers(start, end) {
  try {
    const { UserModel } = await import('../models/User.js');
    return UserModel.countDocuments({ createdAt: { $gte: start, $lt: end }, role: { $ne: 'admin' } });
  } catch {
    return 0;
  }
}

export async function aggregateDailyReport(dateKey) {
  const { start, end } = pakistanDayRange(dateKey);
  const summary = await summarizeRange(start, end);
  const sessions = await AnalyticsSessionModel.find({ startedAt: { $gte: start, $lt: end } })
    .sort({ lastActivityAt: -1 })
    .limit(40)
    .lean();

  const users = sessions.map((session) => ({
    user: session.userId ? `user:${String(session.userId).slice(-6)}` : `anon:${String(session.anonymousId || 'session').slice(-6)}`,
    platform: normalizeAnalyticsPlatform(session.platform),
    sessions: 1,
    totalUsageMs: Math.max(0, new Date(session.endedAt || session.lastActivityAt || session.startedAt).getTime() - new Date(session.startedAt).getTime()),
    lastActive: session.lastActivityAt,
  }));

  return {
    dateKey,
    ...summary,
    users,
  };
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

export async function buildDailyAnalyticsPdf(summary) {
  const dateLabel = new Date(`${summary.dateKey}T00:00:00+05:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 46, right: 46 } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1e3a8a').text('NET360', { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('Daily User Analytics & System Health Report');
    doc.font('Helvetica').fontSize(11).fillColor('#475569').text(dateLabel);
    doc.moveDown(0.8);

    const addSection = (title, lines) => {
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e3a8a').text(title);
      doc.moveDown(0.2);
      lines.forEach((line) => {
        doc.font('Helvetica').fontSize(10).fillColor('#1f2937').text(`- ${line}`, { indent: 10 });
      });
      doc.moveDown(0.55);
    };

    addSection('Executive Summary', [
      `Total Active Users: ${summary.activeUsers}`,
      `New Users: ${summary.newUsers}`,
      `Returning Users: ${summary.returningUsers}`,
      `Total Sessions: ${summary.sessions}`,
      `Total Usage Time: ${formatDuration(summary.totalUsageMs)}`,
      `Average Session Duration: ${formatDuration(summary.averageSessionMs)}`,
    ]);
    addSection('Platform', [
      `Web: ${summary.platforms?.web || 0}`,
      `Android: ${summary.platforms?.android || 0}`,
      `iOS: ${summary.platforms?.ios || 0}`,
    ]);
    addSection('Feature Usage', [
      `Tests: ${summary.features?.TESTS || 0}`,
      `Practice Board: ${summary.features?.PRACTICE_BOARD || 0}`,
      `Preparation Materials: ${summary.features?.PREPARATION_MATERIALS || 0}`,
      `Programs: ${summary.features?.PROGRAMS || 0}`,
      `Community: ${summary.features?.COMMUNITY || 0}`,
      `Quiz Battles: ${summary.features?.QUIZ_BATTLE || 0}`,
      `Performance Analytics: ${summary.features?.PERFORMANCE_ANALYTICS || 0}`,
      `NUST Admission Guide: ${summary.features?.NUST_ADMISSION_GUIDE || 0}`,
      `Support: ${summary.features?.SUPPORT_CHAT || 0}`,
    ]);
    addSection('Technical Health', [
      `Login failures: ${summary.errors?.login || 0}`,
      `API errors: ${summary.errors?.api || 0}`,
      `Test-launch failures: ${summary.errors?.tests || 0}`,
      `Practice Board failures: ${summary.errors?.practiceBoard || 0}`,
      `Community failures: ${summary.errors?.community || 0}`,
      `PDF failures: ${summary.errors?.pdf || 0}`,
      `NUST feed failures: ${summary.errors?.nust || 0}`,
    ]);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e3a8a').text('User Activity');
    doc.moveDown(0.2);
    const rows = Array.isArray(summary.users) ? summary.users.slice(0, 20) : [];
    if (!rows.length) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#64748b').text('No session activity recorded.');
    } else {
      rows.forEach((row) => {
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937').text(
          `${row.user}  |  ${row.platform}  |  sessions ${row.sessions}  |  ${formatDuration(row.totalUsageMs)}`,
        );
      });
    }

    doc.end();
  });
}

export async function claimDailyReport(dateKey) {
  const reportId = buildDailyReportId(dateKey);
  try {
    await AnalyticsDailyReportModel.create({
      reportId,
      reportDate: dateKey,
      status: 'pending',
      summary: {},
    });
    return reportId;
  } catch (error) {
    if (String(error?.code) === '11000') return '';
    throw error;
  }
}

export async function markDailyReportSent(reportId, summary, recipients) {
  await AnalyticsDailyReportModel.updateOne(
    { reportId },
    {
      $set: {
        status: 'sent',
        summary,
        recipients,
        sentAt: new Date(),
        error: '',
      },
    },
  );
}

export async function markDailyReportFailed(reportId, error) {
  await AnalyticsDailyReportModel.updateOne(
    { reportId },
    { $set: { status: 'failed', error: sanitizeAnalyticsText(error, 180) } },
  );
}

export function buildSystemAlertEmail(payload, userEmail = '') {
  const time = new Date(payload.timestamp || Date.now()).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const subject = `NET360 SYSTEM ALERT — ${payload.eventType || payload.category}`;
  const text = [
    'NET360 SYSTEM ALERT',
    '',
    `Platform: ${payload.platform || 'web'}`,
    `User: ${userEmail || payload.userId || 'anonymous'}`,
    `Screen: ${payload.screen || payload.resource || 'unknown'}`,
    `Issue: ${payload.eventType || payload.category}`,
    `Error: ${payload.errorCode || payload.message || 'unspecified'}`,
    `Time: ${time} PKT`,
    `App Version: ${payload.appVersion || 'unknown'}`,
  ].join('\n');
  return { subject, text, html: `<pre style="font-family:Inter,Arial,sans-serif">${text.replace(/</g, '&lt;')}</pre>` };
}

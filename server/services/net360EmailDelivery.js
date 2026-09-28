import { EmailDeliveryModel } from '../models/EmailDelivery.js';
import { UserModel } from '../models/User.js';
import { accountNeedsEmailVerification } from '../lib/emailVerification.js';
import { isOptionalNotificationEnabled, isOptionalNotificationKey } from '../lib/notificationPreferences.js';

const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const STALE_SENDING_MS = 2 * 60 * 1000;

export function classifyProviderError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  if (status === 429 || /quota|rate limit|rate_limit|too many requests|daily sending limit|daily_quota/.test(message)) {
    return 'quota';
  }
  const recipientProblem = /invalid `to`|invalid to field|invalid email address|recipient address|email address is not valid|does not comply with addr-spec|invalid recipient/;
  const senderProblem = /domain|from address|sender|not verified/;
  if (recipientProblem.test(message) && !senderProblem.test(message)) return 'permanent-recipient';
  if ((status === 400 || status === 422) && recipientProblem.test(message)) return 'permanent-recipient';
  return 'temporary';
}

export function sanitizeEmailError(error, secrets = []) {
  let message = error instanceof Error ? error.message : String(error || 'Email provider error');
  for (const secret of secrets) {
    const value = String(secret || '').trim();
    if (value) message = message.split(value).join('[redacted]');
  }
  return message
    .replace(/re_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/xkeysib-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 220);
}

export function emailAllowedByPreference({ emailType, preferences, mandatory }) {
  if (mandatory || emailType === 'verification' || emailType === 'account-deletion') return true;
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  if (prefs.emailNotifications === false) return false;
  if (emailType === 'daily-reminder') return prefs.dailyReminders !== false;
  if (emailType === 'weekly-report') return prefs.performanceReports !== false;
  const category = emailType === 'video-published'
    ? 'videoUploads'
    : emailType === 'nust'
      ? 'nustUpdates'
      : emailType;
  if (isOptionalNotificationKey(category) && !isOptionalNotificationEnabled(prefs, category)) return false;
  return true;
}

export function shouldAnnounceVideoPublish(previousUrl, nextUrl) {
  return !String(previousUrl || '').trim() && Boolean(String(nextUrl || '').trim());
}

export function isoWeekKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const utc = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function dayKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return value.toISOString().slice(0, 10);
}

function retryDelay(attempts) {
  const power = Math.min(8, Math.max(1, Number(attempts) || 1));
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** (power - 1)));
}

function logDelivery({ emailEventId, provider, status, errorCategory }) {
  console.log(JSON.stringify({
    emailEventId: String(emailEventId || ''),
    provider: String(provider || ''),
    status: String(status || ''),
    errorCategory: String(errorCategory || ''),
    timestamp: new Date().toISOString(),
  }));
}

function mongooseStore() {
  return {
    async create(doc) {
      try {
        const created = await EmailDeliveryModel.create(doc);
        return { duplicate: false, doc: created.toObject() };
      } catch (error) {
        if (error?.code === 11000) {
          const existing = await EmailDeliveryModel.findOne({ eventId: doc.eventId }).lean();
          return { duplicate: true, doc: existing };
        }
        throw error;
      }
    },
    async update(eventId, patch) {
      return EmailDeliveryModel.findOneAndUpdate({ eventId }, { $set: patch }, { new: true }).lean();
    },
    async findRetryable(now) {
      const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
      return EmailDeliveryModel.find({
        $or: [
          { status: 'retry', nextAttemptAt: { $lte: now } },
          { status: 'sending', updatedAt: { $lte: staleBefore } },
        ],
      }).sort({ nextAttemptAt: 1, updatedAt: 1 }).limit(25).lean();
    },
  };
}

async function postBrevoEmail({ to, subject, text, html }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const fromEmail = String(process.env.BREVO_FROM_EMAIL || '').trim();
  const fromName = String(process.env.BREVO_FROM_NAME || 'NET360 Preparation').trim() || 'NET360 Preparation';
  if (!apiKey || !fromEmail) {
    const error = new Error('Brevo is not configured');
    error.status = 503;
    throw error;
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      textContent: text || '',
      htmlContent: html || text || '',
    }),
  });
  const body = await response.text().catch(() => '');
  if (!response.ok) {
    let detail = String(body || '').slice(0, 180);
    try {
      const parsed = JSON.parse(body);
      detail = String(parsed?.message || parsed?.code || detail);
    } catch {
      /* keep snippet */
    }
    const error = new Error(`Brevo ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }
  let messageId = '';
  try {
    messageId = String(JSON.parse(body)?.messageId || '');
  } catch {
    messageId = '';
  }
  return { messageId };
}

export function createNet360EmailDelivery(overrides = {}) {
  const store = overrides.store || mongooseStore();
  const transports = {
    sendResend: overrides.sendResend || (async () => {
      const error = new Error('Resend is not configured');
      error.status = 503;
      throw error;
    }),
    sendBrevo: overrides.sendBrevo || postBrevoEmail,
    sendSmtp: overrides.sendSmtp || null,
  };
  const sleep = overrides.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const retryDelayMs = Number.isFinite(overrides.retryDelayMs) ? overrides.retryDelayMs : 400;
  const secrets = () => [process.env.RESEND_API_KEY, process.env.BREVO_API_KEY, process.env.SMTP_PASS];

  function setTransports(next) {
    if (typeof next?.sendResend === 'function') transports.sendResend = next.sendResend;
    if (typeof next?.sendBrevo === 'function') transports.sendBrevo = next.sendBrevo;
    if (typeof next?.sendSmtp === 'function') transports.sendSmtp = next.sendSmtp;
  }

  async function finish(doc, patch) {
    const saved = await store.update(doc.eventId, patch);
    logDelivery({
      emailEventId: doc.eventId,
      provider: patch.provider || doc.provider || '',
      status: patch.status,
      errorCategory: patch.errorCategory || '',
    });
    return { ...(saved || { ...doc, ...patch }), duplicate: false };
  }

  async function tryProvider(name, send, message) {
    try {
      const result = await send(message);
      return { ok: true, messageId: String(result?.messageId || '') };
    } catch (error) {
      const errorCategory = classifyProviderError(error);
      logDelivery({
        emailEventId: message.eventId,
        provider: name,
        status: 'failed',
        errorCategory,
      });
      return {
        ok: false,
        errorCategory,
        lastError: sanitizeEmailError(error, secrets()),
      };
    }
  }

  async function deliver(doc) {
    const message = {
      eventId: doc.eventId,
      to: doc.recipientEmail,
      subject: doc.subject,
      text: doc.text,
      html: doc.html,
    };
    let resend = await tryProvider('resend', transports.sendResend, message);
    if (!resend.ok && resend.errorCategory === 'temporary') {
      if (retryDelayMs > 0) await sleep(retryDelayMs);
      resend = await tryProvider('resend', transports.sendResend, message);
    }
    if (resend.ok) {
      return finish(doc, {
        status: 'sent',
        provider: 'resend',
        providerMessageId: resend.messageId,
        sentAt: new Date(),
        lastError: '',
        errorCategory: '',
        nextAttemptAt: null,
      });
    }
    if (resend.errorCategory === 'permanent-recipient') {
      return finish(doc, {
        status: 'failed',
        provider: 'resend',
        lastError: resend.lastError,
        errorCategory: 'permanent-recipient',
        nextAttemptAt: null,
      });
    }

    const brevo = await tryProvider('brevo', transports.sendBrevo, message);
    if (brevo.ok) {
      return finish(doc, {
        status: 'sent',
        provider: 'brevo',
        providerMessageId: brevo.messageId,
        sentAt: new Date(),
        lastError: '',
        errorCategory: '',
        nextAttemptAt: null,
      });
    }
    if (brevo.errorCategory === 'permanent-recipient') {
      return finish(doc, {
        status: 'failed',
        provider: 'brevo',
        lastError: brevo.lastError,
        errorCategory: 'permanent-recipient',
        nextAttemptAt: null,
      });
    }

    if (doc.allowSmtpFallback && typeof transports.sendSmtp === 'function') {
      const smtp = await tryProvider('smtp', transports.sendSmtp, message);
      if (smtp.ok) {
        return finish(doc, {
          status: 'sent',
          provider: 'smtp',
          providerMessageId: smtp.messageId,
          sentAt: new Date(),
          lastError: '',
          errorCategory: '',
          nextAttemptAt: null,
        });
      }
    }

    const attempts = Number(doc.attempts || 1);
    return finish(doc, {
      status: 'retry',
      provider: '',
      lastError: brevo.lastError || resend.lastError || 'delivery failed',
      errorCategory: brevo.errorCategory || resend.errorCategory || 'temporary',
      nextAttemptAt: new Date(Date.now() + retryDelay(attempts)),
    });
  }

  async function sendNet360Email(input) {
    const eventId = String(input?.eventId || '').trim();
    const recipientEmail = String(input?.recipientEmail || input?.to || '').trim().toLowerCase();
    const emailType = String(input?.emailType || 'transactional').trim();
    if (!eventId) {
      return { status: 'failed', errorCategory: 'invalid-event', duplicate: false };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      logDelivery({ emailEventId: eventId, provider: '', status: 'failed', errorCategory: 'permanent-recipient' });
      return { status: 'failed', errorCategory: 'permanent-recipient', duplicate: false };
    }

    const allowed = emailAllowedByPreference({
      emailType,
      preferences: input?.preferences,
      mandatory: Boolean(input?.mandatory),
    });
    const base = {
      eventId,
      userId: String(input?.userId || ''),
      recipientEmail,
      emailType,
      subject: String(input?.subject || ''),
      text: String(input?.text || ''),
      html: String(input?.html || ''),
      provider: '',
      attempts: allowed ? 1 : 0,
      providerMessageId: '',
      sentAt: null,
      lastError: '',
      errorCategory: allowed ? '' : 'preference-disabled',
      nextAttemptAt: null,
      allowSmtpFallback: Boolean(input?.allowSmtpFallback),
      status: allowed ? 'sending' : 'skipped',
    };
    const created = await store.create(base);
    if (created.duplicate) {
      const existing = created.doc || {};
      logDelivery({
        emailEventId: eventId,
        provider: existing.provider || '',
        status: existing.status || 'duplicate',
        errorCategory: 'duplicate',
      });
      return { ...existing, duplicate: true, status: existing.status || 'duplicate' };
    }
    if (!allowed) {
      logDelivery({ emailEventId: eventId, provider: '', status: 'skipped', errorCategory: 'preference-disabled' });
      return { ...created.doc, duplicate: false, status: 'skipped' };
    }
    return deliver(created.doc);
  }

  async function processRetryQueue(now = new Date()) {
    const due = await store.findRetryable(now);
    const results = [];
    for (const row of due) {
      const claimed = await store.update(row.eventId, {
        status: 'sending',
        attempts: Number(row.attempts || 0) + 1,
      });
      if (!claimed || claimed.status !== 'sending') continue;
      results.push(await deliver({ ...row, ...claimed }));
    }
    return results;
  }

  return { sendNet360Email, processRetryQueue, setTransports };
}

const delivery = createNet360EmailDelivery();

export const sendNet360Email = (input) => delivery.sendNet360Email(input);
export const processEmailRetryQueue = (now) => delivery.processRetryQueue(now);
export const setEmailTransports = (transports) => delivery.setTransports(transports);

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appBaseUrl(explicit) {
  const raw = String(explicit || process.env.NET360_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (raw) return raw.includes('://') ? raw : `https://${raw}`;
  return 'https://www.net360preparation.com';
}

function studentGreeting(user) {
  return String(user?.firstName || '').trim() || 'there';
}

async function listEligibleStudents() {
  const users = await UserModel.find({
    role: { $ne: 'admin' },
    email: { $exists: true, $ne: '' },
  }).select('firstName lastName email role requiresEmailVerification emailVerifiedAt authProvider authProviderDetail preferences progress').lean();
  return users.filter((user) => user?.email && !accountNeedsEmailVerification(user));
}

export async function announcePublishedVideo({
  videoId,
  title,
  subject,
  part,
  chapter,
  section,
  appBaseUrl: base,
}) {
  const id = String(videoId || '').trim();
  if (!id) return [];
  const place = [subject, part, chapter, section].map((item) => String(item || '').trim()).filter(Boolean).join(' → ');
  const videoTitle = String(title || 'New NET360 video').trim().slice(0, 160);
  const url = `${appBaseUrl(base)}/preparation`;
  const users = await listEligibleStudents();
  const results = [];
  for (const user of users) {
    const greeting = studentGreeting(user);
    const safeTitle = escapeHtml(videoTitle);
    const safePlace = escapeHtml(place);
    const safeUrl = escapeHtml(url);
    const paragraphs = [
      `A new video is available: ${videoTitle}.`,
      place ? `Where to find it: ${place}.` : 'Open the Videos section in NET360 Preparation.',
      'This notice is sent only the first time the video is published.',
    ];
    results.push(await sendNet360Email({
      eventId: `video-published:${id}:${user._id}`,
      userId: String(user._id),
      recipientEmail: user.email,
      emailType: 'video-published',
      preferences: user.preferences,
      subject: `NET360: new video — ${videoTitle}`,
      text: [`Hi ${greeting},`, '', ...paragraphs, '', url, '', '— NET360 Preparation'].join('\n'),
      html: `<p>Hi ${escapeHtml(greeting)},</p><p>A new video is available: ${safeTitle}.</p><p>${safePlace ? `Where to find it: ${safePlace}.` : 'Open the Videos section in NET360 Preparation.'}</p><p><a href="${safeUrl}">Open Videos</a></p>`,
    }));
  }
  return results;
}

let lastDailyDigestKey = '';
let lastWeeklyDigestKey = '';

export async function sendDuePracticeDigests(now = new Date()) {
  const day = dayKey(now);
  const week = isoWeekKey(now);
  const sendDaily = lastDailyDigestKey !== day;
  const sendWeekly = lastWeeklyDigestKey !== week;
  if (!sendDaily && !sendWeekly) return [];
  const users = await listEligibleStudents();
  const results = [];
  for (const user of users) {
    const greeting = studentGreeting(user);
    const practiceUrl = `${appBaseUrl()}/preparation`;
    if (sendDaily) results.push(await sendNet360Email({
      eventId: `daily-reminder:${day}:${user._id}`,
      userId: String(user._id),
      recipientEmail: user.email,
      emailType: 'daily-reminder',
      preferences: user.preferences,
      subject: 'NET360 daily practice reminder',
      text: [`Hi ${greeting},`, '', 'Your daily NET360 practice reminder is ready.', '', practiceUrl, '', '— NET360 Preparation'].join('\n'),
      html: `<p>Hi ${escapeHtml(greeting)},</p><p>Your daily NET360 practice reminder is ready.</p><p><a href="${escapeHtml(practiceUrl)}">Continue practice</a></p>`,
    }));
    if (!sendWeekly) continue;
    const progress = user.progress || {};
    const tests = Number(progress.testsCompleted || 0);
    const average = Number(progress.averageScore || 0);
    const solved = Number(progress.questionsSolved || 0);
    const analyticsUrl = `${appBaseUrl()}/analytics`;
    results.push(await sendNet360Email({
      eventId: `weekly-report:${week}:${user._id}`,
      userId: String(user._id),
      recipientEmail: user.email,
      emailType: 'weekly-report',
      preferences: user.preferences,
      subject: 'NET360 weekly performance report',
      text: [
        `Hi ${greeting},`,
        '',
        `This week’s NET360 snapshot: ${tests} test(s) completed, average score ${average}, ${solved} question(s) solved.`,
        '',
        analyticsUrl,
        '',
        '— NET360 Preparation',
      ].join('\n'),
      html: `<p>Hi ${escapeHtml(greeting)},</p><p>This week’s NET360 snapshot: ${tests} test(s) completed, average score ${average}, ${solved} question(s) solved.</p><p><a href="${escapeHtml(analyticsUrl)}">View analytics</a></p>`,
    }));
  }
  if (sendDaily) lastDailyDigestKey = day;
  if (sendWeekly) lastWeeklyDigestKey = week;
  return results;
}

let digestTimer = null;
let retryTimer = null;
let digestsStarted = false;

export function startNet360EmailMaintenance() {
  if (retryTimer || digestTimer) return;
  retryTimer = setInterval(() => {
    void processEmailRetryQueue().catch(() => undefined);
  }, 60 * 1000);
  retryTimer.unref?.();
  const runDigests = () => {
    if (digestsStarted) return;
    digestsStarted = true;
    void sendDuePracticeDigests().catch(() => undefined).finally(() => {
      digestsStarted = false;
    });
  };
  digestTimer = setInterval(runDigests, 60 * 60 * 1000);
  digestTimer.unref?.();
  runDigests();
}

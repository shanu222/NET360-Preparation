import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import Twilio from 'twilio';
import PDFDocument from 'pdfkit';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import multer from 'multer';
import * as cheerio from 'cheerio';
import { connectMongo } from './lib/mongo.js';
import { UserModel } from './models/User.js';
import { MCQModel } from './models/MCQ.js';
import { TestSessionModel } from './models/TestSession.js';
import { AttemptModel } from './models/Attempt.js';
import { AIUsageModel } from './models/AIUsage.js';
import { PracticeBoardQuestionModel } from './models/PracticeBoardQuestion.js';
import { QuestionSubmissionModel } from './models/QuestionSubmission.js';
import { ContributionPolicyModel } from './models/ContributionPolicy.js';
import { SubmissionRestrictionModel } from './models/SubmissionRestriction.js';
import { CommunityProfileModel } from './models/CommunityProfile.js';
import { CommunityConnectionRequestModel } from './models/CommunityConnectionRequest.js';
import { CommunityConnectionModel } from './models/CommunityConnection.js';
import { CommunityMessageModel } from './models/CommunityMessage.js';
import { CommunityReportModel } from './models/CommunityReport.js';
import { CommunityBlockModel } from './models/CommunityBlock.js';
import { CommunityRoomPostModel } from './models/CommunityRoomPost.js';
import { CommunityQuizChallengeModel } from './models/CommunityQuizChallenge.js';
import { SignupRequestModel } from './models/SignupRequest.js';
import { SignupTokenModel } from './models/SignupToken.js';
import { PremiumSubscriptionRequestModel } from './models/PremiumSubscriptionRequest.js';
import { PremiumActivationTokenModel } from './models/PremiumActivationToken.js';
import { PasswordRecoveryRequestModel } from './models/PasswordRecoveryRequest.js';
import { SupportChatMessageModel } from './models/SupportChatMessage.js';
import { SecurityAuditEventModel } from './models/SecurityAuditEvent.js';
import { RuntimeConfigModel } from './models/RuntimeConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const AI_DAILY_LIMIT = Number(process.env.SMART_DAILY_LIMIT || process.env.AI_DAILY_LIMIT || 50);
const OPENAI_MODEL = process.env.MODEL_PROVIDER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SIGNUP_TOKEN_TTL_MINUTES = Number(
  process.env.SIGNUP_TOKEN_TTL_MINUTES
  || (Number(process.env.SIGNUP_TOKEN_TTL_HOURS || 0) > 0 ? Number(process.env.SIGNUP_TOKEN_TTL_HOURS) * 60 : 0)
  || 15,
);
const PREMIUM_TOKEN_TTL_HOURS = Number(process.env.PREMIUM_TOKEN_TTL_HOURS || 24);
const NUST_UPDATES_CACHE_MS = Number(process.env.NUST_UPDATES_CACHE_MS || 60 * 1000);
const NUST_ADMISSIONS_REFRESH_MS = clamp(Number(process.env.NUST_ADMISSIONS_REFRESH_MS || 3 * 60 * 60 * 1000), 15 * 60 * 1000, 24 * 60 * 60 * 1000);
const MAX_JSON_BODY_MB = clamp(Number(process.env.MAX_JSON_BODY_MB || 10), 1, 20);
const REQUEST_TIMEOUT_MS = clamp(Number(process.env.REQUEST_TIMEOUT_MS || 30_000), 5_000, 120_000);
const AI_PARSE_MAX_FILE_MB = clamp(Number(process.env.AI_PARSE_MAX_FILE_MB || 20), 1, 50);
const AI_PARSE_MAX_FILE_BYTES = AI_PARSE_MAX_FILE_MB * 1024 * 1024;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, '').toLowerCase())
  .filter(Boolean);

const MOBILE_RUNTIME_ORIGINS = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'ionic://localhost',
]);

const MODEL_PROVIDER_KEY = process.env.MODEL_PROVIDER_API_KEY || process.env.OPENAI_API_KEY || '';
const SMTP_HOST = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM_EMAIL = String(process.env.SMTP_FROM_EMAIL || SMTP_USER).trim();
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_PHONE_NUMBER = String(process.env.TWILIO_PHONE_NUMBER || '').trim();
const TWILIO_WHATSAPP_FROM = String(process.env.TWILIO_WHATSAPP_FROM || '').trim();
const CONFIG_ENCRYPTION_KEY = String(process.env.CONFIG_ENCRYPTION_KEY || JWT_SECRET || '').trim();
const CONFIG_CRYPTO_KEY = CONFIG_ENCRYPTION_KEY
  ? crypto.createHash('sha256').update(CONFIG_ENCRYPTION_KEY).digest()
  : null;

const runtimeConfigCache = {
  valueByKey: new Map(),
  fetchedAt: 0,
};

const RUNTIME_CONFIG_CACHE_MS = 10_000;

const smtpTransporter = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
  : null;

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

const SUBSCRIPTION_PLANS = {
  basic_monthly: {
    id: 'basic_monthly',
    name: 'Basic Plan',
    tier: 'basic',
    billingCycle: 'monthly',
    pricePkr: 500,
    dailyAiLimit: 50,
    features: ['Image upload solving', 'Structured concept + steps + final answer', 'Basic explanations'],
    expiresInDays: 30,
  },
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Pro Plan',
    tier: 'pro',
    billingCycle: 'monthly',
    pricePkr: 900,
    dailyAiLimit: 200,
    features: ['Faster guided processing priority', 'Advanced step explanations', 'Shortcut solving tricks'],
    expiresInDays: 30,
  },
  basic_yearly: {
    id: 'basic_yearly',
    name: 'Basic Yearly',
    tier: 'basic',
    billingCycle: 'yearly',
    pricePkr: 5000,
    dailyAiLimit: 50,
    features: ['Image upload solving', 'Structured concept + steps + final answer', 'Yearly discounted billing'],
    expiresInDays: 365,
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'Pro Yearly',
    tier: 'pro',
    billingCycle: 'yearly',
    pricePkr: 9000,
    dailyAiLimit: 200,
    features: ['Faster guided processing priority', 'Advanced explanations + tricks', 'Yearly discounted billing'],
    expiresInDays: 365,
  },
};

const app = express();
const aiParseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AI_PARSE_MAX_FILE_BYTES },
});

const sseClients = {
  student: new Map(),
  admin: new Map(),
};

function buildCspDirectives() {
  const connectSources = ["'self'", 'https:', 'http:', 'ws:', 'wss:'];
  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'data:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    connectSrc: connectSources,
    upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
  };
}

async function logSecurityEvent(req, {
  eventType,
  severity = 'warning',
  actorUserId = null,
  actorEmail = '',
  metadata = {},
}) {
  try {
    await SecurityAuditEventModel.create({
      eventType,
      severity,
      actorUserId,
      actorEmail: String(actorEmail || '').trim().toLowerCase(),
      ipAddress: String(req.ip || ''),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 250),
      path: String(req.originalUrl || req.path || ''),
      method: String(req.method || '').toUpperCase(),
      metadata,
      occurredAt: new Date(),
    });
  } catch {
    // Avoid blocking user flows when audit storage is unavailable.
  }
}

function addSseClient(role, userId, res) {
  const streamRole = role === 'admin' ? 'admin' : 'student';
  const clientId = crypto.randomUUID();
  const bucket = sseClients[streamRole];
  bucket.set(clientId, { userId: String(userId || ''), res });

  res.write(`event: sync\ndata: ${JSON.stringify({ type: 'connected', role: streamRole, ts: Date.now() })}\n\n`);

  reqCleanup(res, () => {
    bucket.delete(clientId);
  });

  return clientId;
}

function reqCleanup(res, cb) {
  res.on('close', cb);
  res.on('finish', cb);
}

function broadcastSyncEvent({ role = 'all', event = 'sync', data = {} }) {
  const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, ts: Date.now() })}\n\n`;
  const targets = [];

  if (role === 'all' || role === 'student') {
    targets.push(...Array.from(sseClients.student.entries()));
  }
  if (role === 'all' || role === 'admin') {
    targets.push(...Array.from(sseClients.admin.entries()));
  }

  targets.forEach(([clientId, client]) => {
    try {
      client.res.write(payload);
    } catch {
      if (sseClients.student.has(clientId)) {
        sseClients.student.delete(clientId);
      }
      if (sseClients.admin.has(clientId)) {
        sseClients.admin.delete(clientId);
      }
    }
  });
}

setInterval(() => {
  broadcastSyncEvent({ role: 'all', event: 'heartbeat', data: { type: 'heartbeat' } });
}, 25000).unref();

const PAYMENT_PROOF_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);
const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
// Render sits behind a proxy and forwards client IP in X-Forwarded-For.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('query parser', 'simple');
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: buildCspDirectives(),
    },
  }),
);

function sanitizePrimitive(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\u0000/g, '');
}

function sanitizePayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item));
  }

  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, nested]) => {
      const safeKey = String(key || '').trim();
      if (!safeKey) return;
      if (safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') return;
      if (safeKey.startsWith('$')) return;
      out[safeKey] = sanitizePayload(nested);
    });
    return out;
  }

  return sanitizePrimitive(value);
}

function isAllowedOrigin(origin) {
  const normalizedOrigin = String(origin || '').trim().replace(/\/+$/, '').toLowerCase();
  if (!normalizedOrigin) return true;
  if (MOBILE_RUNTIME_ORIGINS.has(normalizedOrigin)) return true;
  if (!IS_PRODUCTION) return true;
  if (CORS_ALLOWED_ORIGINS.length === 0) return true;

  const matches = CORS_ALLOWED_ORIGINS.some((allowedOrigin) => {
    if (!allowedOrigin) return false;
    if (allowedOrigin === '*') return true;
    if (!allowedOrigin.includes('*')) {
      return allowedOrigin === normalizedOrigin;
    }

    const escaped = allowedOrigin
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(normalizedOrigin);
  });

  return matches;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS origin denied.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: `${MAX_JSON_BODY_MB}mb` }));
app.use(express.urlencoded({ extended: false, limit: `${MAX_JSON_BODY_MB}mb` }));
app.use((req, res, next) => {
  req.body = sanitizePayload(req.body);
  req.query = sanitizePayload(req.query);
  req.params = sanitizePayload(req.params);
  res.setTimeout(REQUEST_TIMEOUT_MS);
  next();
});

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 800,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  }),
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts. Please try again shortly.' },
  }),
);

app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again shortly.' },
  }),
);

app.use(
  '/api/auth/forgot-password',
  rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reset requests. Please wait before retrying.' },
  }),
);

app.use(
  '/api/auth/reset-password',
  rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many password reset attempts. Please try again later.' },
  }),
);

app.use(
  '/api/ai',
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI endpoint rate limit reached. Please wait a moment and retry.' },
  }),
);

const DEFAULT_NUST_IMPORTANT_DATES = [
  {
    key: 'series-1',
    title: 'NET Series 1',
    registration: 'Online Registration: 05 Oct - 25 Nov 2025',
    testDate: 'Test Schedule: 22 Nov - 10 Dec 2025',
    status: 'completed',
  },
  {
    key: 'series-2',
    title: 'NET Series 2',
    registration: 'Online Registration: 14 Dec 2025 - 01 Feb 2026',
    testDate: 'Test Schedule: 31 Jan - 15 Feb 2026 (Islamabad); 25 - 26 Mar 2026 (Quetta)',
    status: 'open',
  },
  {
    key: 'series-3',
    title: 'NET Series 3',
    registration: 'Online Registration: 22 Feb - 30 Mar 2026',
    testDate: 'Test Schedule: 04 Apr 2026 onwards',
    status: 'upcoming',
  },
  {
    key: 'series-4',
    title: 'NET Series 4',
    registration: 'Online Registration: Apr - Jun 2026',
    testDate: 'Test Schedule: Jun 2026 (Islamabad); Jul 2026 (Quetta)',
    status: 'upcoming',
  },
];

const DEFAULT_NUST_IMPORTANT_NOTICES = [
  {
    key: 'notice-default-1',
    title: 'Important notices are being refreshed automatically.',
    subtitle: 'Latest updates from NUST undergraduate admissions will appear here shortly.',
    category: 'notice',
    status: 'info',
  },
];

const nustUpdatesCache = {
  fetchedAt: 0,
  lastAttemptAt: 0,
  refreshInFlight: false,
  lastError: '',
  dates: DEFAULT_NUST_IMPORTANT_DATES,
  notices: DEFAULT_NUST_IMPORTANT_NOTICES,
  updates: [],
};

const CONTENT_RESTRICTION_MESSAGE = 'Your submission contains content that does not meet the platform guidelines.\nUpload access has been temporarily restricted.\nPlease contact the administration if you believe this action was taken by mistake.';
const SUPPORTED_SUBJECTS = new Set([
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'english',
  'computer-science',
  'intelligence',
  'quantitative mathematics',
  'quantitative-mathematics',
  'design aptitude',
  'design-aptitude',
]);
const DEFAULT_CONTRIBUTION_POLICY = {
  maxSubmissionsPerDay: 5,
  maxFilesPerSubmission: 3,
  maxFileSizeBytes: 1024 * 1024,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  blockDurationMinutes: 180,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parsePositiveInt(value, fallback, min = 1, max = 500) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function readPagination(query, options = {}) {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 200;
  const page = parsePositiveInt(query?.page, 1, 1, 10_000);
  const limit = parsePositiveInt(query?.limit, defaultLimit, 1, maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function escapeRegexLiteral(value, maxLen = 80) {
  const normalized = String(value || '').trim().slice(0, maxLen);
  if (!normalized) return '';
  return normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value, maxLen = 80) {
  const escaped = escapeRegexLiteral(value, maxLen);
  if (!escaped) return null;
  return { $regex: escaped, $options: 'i' };
}

const COMMUNITY_PROFILE_SELECT = 'userId username shareProfilePicture profilePictureUrl favoriteSubjects targetNetType subjectsNeedHelp preparationLevel studyTimePreference testScoreRange bio quizStats createdAt';
const COMMUNITY_USER_SELECT = 'firstName lastName targetProgram city progress.averageScore progress.weakTopics role';
const COMMUNITY_CONNECTION_SELECT = 'participantA participantB createdAt blockedByUserIds';
const COMMUNITY_REQUEST_SELECT = 'fromUserId toUserId status createdAt';
const COMMUNITY_MESSAGE_SELECT = 'connectionId senderUserId messageType text attachment voiceMeta callInvite reactions createdAt readByUserIds';
const COMMUNITY_ROOM_POST_SELECT = 'roomId authorUserId type title text subject upvotes answers flagged createdAt';
const MCQ_SELECT = 'subject part chapter section topic question questionImageUrl questionImage options optionMedia answer tip explanationText explanationImage shortTrickText shortTrickImage difficulty source createdAt';
const PRACTICE_BOARD_SELECT = 'subject difficulty questionText questionFile questionImageUrl solutionText solutionFile solutionImageUrl source createdAt';

const CHAT_ATTACHMENT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const CHAT_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
]);

const PRACTICE_BOARD_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const PRACTICE_BOARD_MAX_FILE_BYTES = 8 * 1024 * 1024;
const MCQ_ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/avif',
  'image/tiff',
]);
const MCQ_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MCQ_PART_REQUIRED_SUBJECTS = new Set(['mathematics', 'physics', 'chemistry', 'biology', 'english']);
const MCQ_FLAT_TOPIC_SUBJECTS = new Set(['quantitative-mathematics', 'design-aptitude']);
const COMMUNITY_PROFILE_PICTURE_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const COMMUNITY_PROFILE_PICTURE_MAX_BYTES = 3 * 1024 * 1024;

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeSubjectKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function isPartSelectionRequiredSubject(value) {
  return MCQ_PART_REQUIRED_SUBJECTS.has(normalizeSubjectKey(value));
}

function normalizeContributionActorKey(params) {
  const userId = String(params?.submittedByUserId || '').trim();
  if (userId) return `user:${userId}`;

  const clientId = String(params?.submittedByClientId || '').trim();
  if (clientId) return `client:${clientId}`;

  const email = String(params?.submittedByEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  const ip = String(params?.ipAddress || '').trim();
  const ua = String(params?.userAgent || '').trim();
  return `guest:${hashToken(`${ip}|${ua}`)}`;
}

async function getContributionPolicy() {
  const existing = await ContributionPolicyModel.findOne({ key: 'default' }).lean();
  if (existing) {
    return {
      maxSubmissionsPerDay: clamp(Number(existing.maxSubmissionsPerDay) || DEFAULT_CONTRIBUTION_POLICY.maxSubmissionsPerDay, 1, 100),
      maxFilesPerSubmission: clamp(Number(existing.maxFilesPerSubmission) || DEFAULT_CONTRIBUTION_POLICY.maxFilesPerSubmission, 1, 10),
      maxFileSizeBytes: clamp(Number(existing.maxFileSizeBytes) || DEFAULT_CONTRIBUTION_POLICY.maxFileSizeBytes, 64 * 1024, 10 * 1024 * 1024),
      allowedMimeTypes: Array.isArray(existing.allowedMimeTypes) && existing.allowedMimeTypes.length
        ? existing.allowedMimeTypes
        : DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
      blockDurationMinutes: clamp(Number(existing.blockDurationMinutes) || DEFAULT_CONTRIBUTION_POLICY.blockDurationMinutes, 5, 10080),
      updatedByEmail: String(existing.updatedByEmail || '').trim(),
    };
  }

  const created = await ContributionPolicyModel.create({ key: 'default', ...DEFAULT_CONTRIBUTION_POLICY });
  return {
    maxSubmissionsPerDay: created.maxSubmissionsPerDay,
    maxFilesPerSubmission: created.maxFilesPerSubmission,
    maxFileSizeBytes: created.maxFileSizeBytes,
    allowedMimeTypes: created.allowedMimeTypes,
    blockDurationMinutes: created.blockDurationMinutes,
    updatedByEmail: String(created.updatedByEmail || '').trim(),
  };
}

function moderateQuestionSubmission(params) {
  const subject = String(params?.subject || '').trim().toLowerCase();
  const normalizedSubject = normalizeSubjectKey(subject);
  const questionText = String(params?.questionText || '').trim();
  const questionDescription = String(params?.questionDescription || '').trim();
  const questionSource = String(params?.questionSource || '').trim();
  const submissionReason = String(params?.submissionReason || '').trim();
  const attachments = Array.isArray(params?.attachments) ? params.attachments : [];

  const blob = [
    normalizedSubject,
    questionText,
    questionDescription,
    questionSource,
    submissionReason,
    ...attachments.map((item) => `${item.name} ${item.mimeType} ${String(item.extractedSnippet || '')}`),
  ]
    .join(' ')
    .toLowerCase();

  const reasons = [];
  let score = 0;

  if (!SUPPORTED_SUBJECTS.has(normalizedSubject)) {
    reasons.push('Subject is not part of supported academic categories.');
    score += 50;
  }

  const blockedPatterns = [
    /(casino|betting|loan scam|crypto signal|porn|adult|escort|hack|malware|ransomware)/i,
    /(<script|javascript:|onerror=|drop table|union select|--\s)/i,
    /(buy now|free money|click here|subscribe now|whatsapp group)/i,
  ];
  blockedPatterns.forEach((pattern) => {
    if (pattern.test(blob)) {
      reasons.push('Contains malicious, offensive, spam, or fraudulent patterns.');
      score += 50;
    }
  });

  const educationalSignals = /(equation|theorem|proof|mcq|numerical|past paper|chapter|syllabus|concept|net|engineering|science|question)/i;
  if (!educationalSignals.test(blob)) {
    reasons.push('Submission appears non-educational or unrelated to platform scope.');
    score += 35;
  }

  if (questionText.length && questionText.length < 10 && attachments.length === 0) {
    reasons.push('Question text is too short to be useful for review.');
    score += 20;
  }

  const normalizedReasons = Array.from(new Set(reasons));
  const result = normalizedReasons.length ? 'rejected' : 'approved';
  const finalScore = normalizedReasons.length ? Math.min(100, score || 60) : 0;
  return { result, reasons: normalizedReasons, score: finalScore };
}

function serializeContributionPolicy(policy) {
  return {
    maxSubmissionsPerDay: clamp(Number(policy?.maxSubmissionsPerDay) || DEFAULT_CONTRIBUTION_POLICY.maxSubmissionsPerDay, 1, 100),
    maxFilesPerSubmission: clamp(Number(policy?.maxFilesPerSubmission) || DEFAULT_CONTRIBUTION_POLICY.maxFilesPerSubmission, 1, 10),
    maxFileSizeBytes: clamp(Number(policy?.maxFileSizeBytes) || DEFAULT_CONTRIBUTION_POLICY.maxFileSizeBytes, 64 * 1024, 10 * 1024 * 1024),
    allowedMimeTypes: Array.isArray(policy?.allowedMimeTypes) && policy.allowedMimeTypes.length
      ? policy.allowedMimeTypes
      : DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
    blockDurationMinutes: clamp(Number(policy?.blockDurationMinutes) || DEFAULT_CONTRIBUTION_POLICY.blockDurationMinutes, 5, 10080),
    updatedByEmail: String(policy?.updatedByEmail || '').trim(),
  };
}

function getAttachmentSignalSnippet(attachment) {
  const dataUrl = String(attachment?.dataUrl || '').trim();
  if (!dataUrl.startsWith('data:')) return '';

  const comma = dataUrl.indexOf(',');
  if (comma < 0) return '';

  const meta = dataUrl.slice(0, comma).toLowerCase();
  const payload = dataUrl.slice(comma + 1);
  try {
    if (meta.includes(';base64')) {
      return Buffer.from(payload, 'base64').toString('utf8').replace(/\s+/g, ' ').slice(0, 2500);
    }
    return decodeURIComponent(payload).replace(/\s+/g, ' ').slice(0, 2500);
  } catch {
    return '';
  }
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) return null;
  const comma = raw.indexOf(',');
  if (comma < 0) return null;

  const meta = raw.slice(5, comma);
  const payload = raw.slice(comma + 1);
  const [mimeTypeRaw = 'application/octet-stream'] = meta.split(';');
  const mimeType = String(mimeTypeRaw || 'application/octet-stream').trim().toLowerCase();
  const isBase64 = /;base64/i.test(meta);

  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

function normalizePracticeBoardFile(input) {
  if (input == null) return null;
  if (typeof input !== 'object') return null;

  const name = String(input.name || '').trim();
  const dataUrl = String(input.dataUrl || '').trim();
  if (!name && !dataUrl) return null;
  if (!name || !dataUrl) {
    throw new Error('Practice file must include both name and dataUrl.');
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) {
    throw new Error(`Invalid file data for ${name}.`);
  }

  const mimeType = String(input.mimeType || parsed.mimeType || 'application/octet-stream').trim().toLowerCase();
  if (!PRACTICE_BOARD_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type for ${name}. Allowed types: JPG, PNG, PDF, DOC, DOCX.`);
  }

  const size = Number(input.size || parsed.buffer.length || 0);
  if (!size || size > PRACTICE_BOARD_MAX_FILE_BYTES) {
    throw new Error(`File ${name} exceeds the ${Math.floor(PRACTICE_BOARD_MAX_FILE_BYTES / (1024 * 1024))}MB limit.`);
  }

  return {
    name,
    mimeType,
    size,
    dataUrl,
  };
}

function normalizeMcqImageFile(input, fieldLabel = 'Image') {
  if (input == null) return null;
  if (typeof input !== 'object') return null;

  const name = String(input.name || '').trim();
  const dataUrl = String(input.dataUrl || '').trim();
  if (!name && !dataUrl) return null;
  if (!name || !dataUrl) {
    throw new Error(`${fieldLabel} must include both name and dataUrl.`);
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) {
    throw new Error(`Invalid uploaded data for ${fieldLabel.toLowerCase()}.`);
  }

  const mimeType = String(input.mimeType || parsed.mimeType || 'application/octet-stream').trim().toLowerCase();
  if (!MCQ_ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported ${fieldLabel.toLowerCase()} format. Use JPG, PNG, WEBP, GIF, SVG, BMP, AVIF, or TIFF.`);
  }

  const size = Number(input.size || parsed.buffer.length || 0);
  if (!size || size > MCQ_MAX_IMAGE_BYTES) {
    throw new Error(`${fieldLabel} exceeds the ${Math.floor(MCQ_MAX_IMAGE_BYTES / (1024 * 1024))}MB limit.`);
  }

  return {
    name,
    mimeType,
    size,
    dataUrl,
  };
}

function sanitizeMcqOptionsWithMedia(optionsRaw, optionMediaRaw) {
  const optionTexts = Array.isArray(optionsRaw)
    ? optionsRaw.map((item) => normalizeRichMcqText(item))
    : [];

  const mediaRows = Array.isArray(optionMediaRaw) ? optionMediaRaw : [];
  const maxLength = Math.max(optionTexts.length, mediaRows.length);
  const resolved = [];

  for (let i = 0; i < maxLength; i += 1) {
    const legacyText = optionTexts[i] || '';
    const row = mediaRows[i] && typeof mediaRows[i] === 'object' ? mediaRows[i] : {};
    const text = normalizeRichMcqText(row.text || legacyText);
    const image = normalizeMcqImageFile(row.image, `Option ${String.fromCharCode(65 + i)} image`);

    if (!text && !image) continue;

    resolved.push({
      key: String(row.key || String.fromCharCode(65 + i)).trim().toUpperCase(),
      text,
      image,
    });
  }

  if (resolved.length < 2) {
    throw new Error('At least two options are required. Each option can contain text, image, or both.');
  }

  const normalizedWithStableKeys = resolved.slice(0, 8).map((item, index) => ({
    key: String.fromCharCode(65 + index),
    text: String(item.text || '').trim(),
    image: item.image || null,
  }));

  const plainOptions = normalizedWithStableKeys.map((item) => item.text || `[${item.key}]`).filter(Boolean);

  return {
    optionMedia: normalizedWithStableKeys,
    options: plainOptions,
  };
}

function normalizeLegacyImageUrlAsFile(rawUrl, fallbackName) {
  const dataUrl = String(rawUrl || '').trim();
  if (!dataUrl) return null;
  if (!dataUrl.startsWith('data:')) {
    return {
      name: fallbackName,
      mimeType: 'image/*',
      size: 0,
      dataUrl,
    };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) return null;
  return {
    name: fallbackName,
    mimeType: parsed.mimeType || 'image/*',
    size: parsed.buffer.length,
    dataUrl,
  };
}

function resolveAnswerToOptionKey(answerRaw, optionMedia, options) {
  const raw = String(answerRaw || '').trim();
  if (!raw) return '';

  const normalizedOptions = Array.isArray(optionMedia) && optionMedia.length
    ? optionMedia
    : (Array.isArray(options)
      ? options.map((text, index) => ({ key: String.fromCharCode(65 + index), text: String(text || '').trim() }))
      : []);

  const byText = normalizedOptions.find((item) => flattenRichMcqTextForMatch(item?.text || '') === flattenRichMcqTextForMatch(raw));
  if (byText?.key) {
    return String(byText.key).trim().toUpperCase();
  }

  const direct = raw.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (direct) {
    const token = direct[1];
    const index = /^\d+$/.test(token)
      ? Number(token) - 1
      : token.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < normalizedOptions.length) {
      return String(normalizedOptions[index].key || String.fromCharCode(65 + index)).trim().toUpperCase();
    }
  }

  return '';
}

function normalizeCommunityProfilePicture(dataUrlRaw) {
  const dataUrl = String(dataUrlRaw || '').trim();
  if (!dataUrl) return '';
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Profile picture must be uploaded as a valid image file.');
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) {
    throw new Error('Invalid profile picture data.');
  }

  const mimeType = String(parsed.mimeType || '').trim().toLowerCase();
  if (!COMMUNITY_PROFILE_PICTURE_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported profile picture format. Use JPG, PNG, WEBP, GIF, or SVG.');
  }

  if (parsed.buffer.length > COMMUNITY_PROFILE_PICTURE_MAX_BYTES) {
    throw new Error('Profile picture exceeds 3MB size limit.');
  }

  return dataUrl;
}

function isAllowedChatAttachmentMime(mimeTypeRaw) {
  const mimeType = String(mimeTypeRaw || '').trim().toLowerCase();
  if (!mimeType) return false;
  if (mimeType.startsWith('image/')) return true;
  return CHAT_ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeType);
}

function normalizeChatAttachment(input, { allowAudio = false } = {}) {
  if (input == null) return null;
  if (typeof input !== 'object') return null;

  const name = String(input.name || '').trim();
  const dataUrl = String(input.dataUrl || '').trim();
  if (!name && !dataUrl) return null;
  if (!name || !dataUrl) {
    throw new Error('Attachment must include both name and dataUrl.');
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) {
    throw new Error(`Invalid file data for ${name}.`);
  }

  const mimeType = String(input.mimeType || parsed.mimeType || 'application/octet-stream').trim().toLowerCase();
  if (!isAllowedChatAttachmentMime(mimeType)) {
    throw new Error(`Unsupported attachment type for ${name}.`);
  }
  if (!allowAudio && mimeType.startsWith('audio/')) {
    throw new Error('Audio attachments are only allowed for voice notes.');
  }

  const size = Number(input.size || parsed.buffer.length || 0);
  if (!size || size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
    throw new Error(`File ${name} exceeds the ${Math.floor(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))}MB limit.`);
  }

  return {
    name,
    mimeType,
    size,
    dataUrl,
  };
}

function serializeMessageReactions(reactions) {
  return Array.isArray(reactions)
    ? reactions.map((item) => ({
      userId: item?.userId ? String(item.userId) : '',
      senderRole: String(item?.senderRole || ''),
      senderUserId: item?.senderUserId ? String(item.senderUserId) : '',
      emoji: String(item?.emoji || ''),
      reactedAt: item?.reactedAt ? new Date(item.reactedAt).toISOString() : null,
    }))
    : [];
}

function serializeCommunityMessage(item) {
  return {
    id: String(item._id),
    connectionId: String(item.connectionId),
    senderUserId: String(item.senderUserId),
    messageType: String(item.messageType || 'text'),
    text: String(item.text || ''),
    attachment: item.attachment
      ? {
        name: String(item.attachment.name || ''),
        mimeType: String(item.attachment.mimeType || ''),
        size: Number(item.attachment.size || 0),
        dataUrl: String(item.attachment.dataUrl || ''),
      }
      : null,
    voiceMeta: item.voiceMeta
      ? {
        durationSeconds: Number(item.voiceMeta.durationSeconds || 0),
      }
      : null,
    callInvite: item.callInvite
      ? {
        mode: String(item.callInvite.mode || ''),
        roomUrl: String(item.callInvite.roomUrl || ''),
        roomCode: String(item.callInvite.roomCode || ''),
      }
      : null,
    reactions: serializeMessageReactions(item.reactions),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

function serializeSupportMessage(item) {
  return {
    id: String(item._id),
    userId: String(item.userId),
    senderRole: String(item.senderRole || 'user'),
    messageType: String(item.messageType || 'text'),
    text: String(item.text || ''),
    attachment: item.attachment
      ? {
        name: String(item.attachment.name || ''),
        mimeType: String(item.attachment.mimeType || ''),
        size: Number(item.attachment.size || 0),
        dataUrl: String(item.attachment.dataUrl || ''),
      }
      : null,
    reactions: serializeMessageReactions(item.reactions),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

function normalizePlainText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\s+((?:q(?:uestion)?\s*)?\d{1,3}\s*[\).:-])/gi, '$1\n$2')
    .trim();
}

function sanitizeAllowedInlineFormattingTags(value) {
  return String(value || '').replace(/<[^>]*>/g, (tag) => {
    const trimmed = String(tag || '').trim();
    const openingStrong = trimmed.match(/^<\s*(strong|b)\b[^>]*>$/i);
    if (openingStrong) return `<${String(openingStrong[1] || '').toLowerCase()}>`;

    const closingStrong = trimmed.match(/^<\s*\/\s*(strong|b)\s*>$/i);
    if (closingStrong) return `</${String(closingStrong[1] || '').toLowerCase()}>`;

    const openingEmphasis = trimmed.match(/^<\s*(em|i)\b[^>]*>$/i);
    if (openingEmphasis) return `<${String(openingEmphasis[1] || '').toLowerCase()}>`;

    const closingEmphasis = trimmed.match(/^<\s*\/\s*(em|i)\s*>$/i);
    if (closingEmphasis) return `</${String(closingEmphasis[1] || '').toLowerCase()}>`;

    return '';
  });
}

function normalizeRichMcqText(value) {
  const raw = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ');

  const withMarkdownBold = raw.replace(/\*\*([^*\n][\s\S]*?)\*\*/g, '<strong>$1</strong>');
  return sanitizeAllowedInlineFormattingTags(withMarkdownBold).trim();
}

function flattenRichMcqTextForMatch(value) {
  return sanitizeAllowedInlineFormattingTags(value)
    .replace(/<\/?(?:strong|b|em|i)>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitInlineOptions(line) {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();
  if (!compact) return [];

  const markerRegex = /(?:^|\s)(?:option\s*)?([A-H]|\d{1,2})(?:[\).:-])?\s+/gi;
  const markers = [];
  let match;

  while ((match = markerRegex.exec(compact))) {
    const label = String(match[1] || '').toUpperCase();
    const markerPos = compact.indexOf(label, match.index);
    markers.push({ label, markerPos, valueStart: markerRegex.lastIndex });
  }

  const startsWithMarker = /^(?:option\s*)?(?:[A-H]|\d{1,2})(?:[\).:-])?\s+\S/i.test(compact);
  if (!markers.length || (!startsWithMarker && markers.length < 2)) {
    return [];
  }

  const extracted = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const end = next ? next.markerPos : compact.length;
    const segment = compact.slice(current.valueStart, end).trim();
    if (segment) extracted.push(segment);
  }

  return extracted;
}

function normalizeOptionText(value) {
  return normalizeRichMcqText(value)
    .replace(/^(?:option\s*)?(?:[A-H]|\d{1,2})(?:\s*[\).:-])?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAnswerToOption(answerRaw, options) {
  const normalizedAnswer = String(answerRaw || '').trim();
  if (!normalizedAnswer) return '';

  const token = normalizedAnswer.match(/(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (token) {
    const marker = token[1];
    const idx = /^\d+$/.test(marker)
      ? Number(marker) - 1
      : marker.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  const answerComparable = flattenRichMcqTextForMatch(normalizedAnswer);
  const directIndex = options.findIndex((item) => flattenRichMcqTextForMatch(item) === answerComparable);
  if (directIndex >= 0) return options[directIndex];

  return normalizedAnswer;
}

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'easy') return 'Easy';
  if (raw === 'hard') return 'Hard';
  return 'Medium';
}

function parseOptionsFromUnknown(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeOptionText(item))
      .filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const options = [];

  for (const line of lines) {
    const inline = splitInlineOptions(line);
    if (inline.length) {
      options.push(...inline.map((item) => normalizeOptionText(item)).filter(Boolean));
      continue;
    }

    const optionMatch = line.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\s*[\).:-])?\s+(.+)$/i);
    if (optionMatch) {
      options.push(normalizeOptionText(optionMatch[2]));
      continue;
    }

    if (!options.length) {
      const parts = raw.split(/\s+(?=(?:option\s*)?(?:[A-H]|\d{1,2})(?:[\).:-])?\s+)/i);
      if (parts.length > 1) {
        return parts
          .map((part) => normalizeOptionText(part))
          .filter(Boolean);
      }
    }
  }

  if (!options.length) {
    return lines.map((line) => normalizeOptionText(line)).filter(Boolean);
  }

  return options;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const BULK_PARSE_LIMIT = 15;
const AI_PARSE_DEFAULT_MODEL = 'gpt-4o';
const AI_PARSE_MAX_INPUT_CHARS = 240_000;
const AI_PARSE_CHUNK_CHARS = 14_000;
const AI_PARSE_CHUNK_OVERLAP = 1_200;
const AI_PARSE_PARALLEL_CHUNKS = 3;
const AI_PARSE_MAX_RETRIES = 3;
const AI_PARSE_RETRY_BASE_DELAY_MS = 600;
const AI_SINGLE_MCQ_MAX_REGENERATIONS = clamp(Number(process.env.AI_SINGLE_MCQ_MAX_REGENERATIONS || 4), 1, 8);
const AI_SINGLE_MCQ_SIMILARITY_THRESHOLD = Math.max(0.6, Math.min(0.99, Number(process.env.AI_SINGLE_MCQ_SIMILARITY_THRESHOLD || 0.84)));
const AI_SINGLE_MCQ_REFERENCE_MAX_TEXT = clamp(Number(process.env.AI_SINGLE_MCQ_REFERENCE_MAX_TEXT || 180_000), 50_000, 300_000);
const MATHPIX_APP_ID = String(process.env.MATHPIX_APP_ID || '').trim();
const MATHPIX_APP_KEY = String(process.env.MATHPIX_APP_KEY || '').trim();

function normalizeParsedHierarchyContext(context) {
  const subjectRaw = String(context?.subject || '').trim().toLowerCase();
  const partRaw = String(context?.part || '').trim().toLowerCase();
  const chapterRaw = String(context?.chapter || '').trim();
  const sectionRaw = String(context?.section || '').trim();
  const topicRaw = String(context?.topic || '').trim();

  const normalizedPart = partRaw === 'part 1' || partRaw === 'part1'
    ? 'part1'
    : partRaw === 'part 2' || partRaw === 'part2'
      ? 'part2'
      : '';

  return {
    subject: subjectRaw,
    part: normalizedPart,
    chapter: chapterRaw,
    section: sectionRaw,
    topic: topicRaw,
  };
}

function parseHierarchyLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const entries = [
    { key: 'subject', re: /^(?:subject|course)\s*[:=-]\s*(.+)$/i },
    { key: 'part', re: /^part\s*[:=-]\s*(.+)$/i },
    { key: 'chapter', re: /^chapter\s*[:=-]\s*(.+)$/i },
    { key: 'section', re: /^section(?:\/topic)?\s*[:=-]\s*(.+)$/i },
    { key: 'topic', re: /^topic\s*[:=-]\s*(.+)$/i },
  ];

  for (const entry of entries) {
    const match = raw.match(entry.re);
    if (match?.[1]) {
      return {
        key: entry.key,
        value: String(match[1] || '').trim(),
      };
    }
  }

  return null;
}

function extractHierarchyContextFromText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const context = {
    subject: '',
    part: '',
    chapter: '',
    section: '',
    topic: '',
  };

  lines.slice(0, 120).forEach((line) => {
    const parsed = parseHierarchyLine(line);
    if (parsed?.key && parsed.value) {
      context[parsed.key] = parsed.value;
    }
  });

  return normalizeParsedHierarchyContext(context);
}

function extractImageReference(line) {
  const raw = String(line || '').trim();
  if (!raw) return '';

  const markdownMatch = raw.match(/!\[[^\]]*\]\(([^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1].trim();

  const labelledMatch = raw.match(/(?:question\s*image|option\s*[A-H\d]*\s*image|explanation\s*image|solution\s*image|tip\s*image|image|img)\s*[:=-]\s*(.+)$/i);
  if (labelledMatch?.[1]) {
    const candidate = labelledMatch[1].trim();
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(candidate) || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  const urlMatch = raw.match(/(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+|https?:\/\/\S+)/i);
  return urlMatch?.[1]?.replace(/\s+/g, '') || '';
}

function splitQuestionBlocks(text) {
  const starts = [];
  const startRegex = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})(?:\s*[\).:-])?\s+/gim;
  let match;

  while ((match = startRegex.exec(text))) {
    starts.push({ index: match.index, number: match[1] });
  }

  if (!starts.length) {
    return [{ number: '1', content: text.trim() }];
  }

  return starts.map((entry, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
    return {
      number: entry.number,
      content: text.slice(entry.index, end).trim(),
    };
  });
}

function splitTextIntoParseChunks(text, chunkSize = AI_PARSE_CHUNK_CHARS, overlap = AI_PARSE_CHUNK_OVERLAP) {
  const source = String(text || '').trim();
  if (!source) return [];

  const chunks = [];
  let cursor = 0;

  while (cursor < source.length) {
    const hardEnd = Math.min(source.length, cursor + chunkSize);
    let end = hardEnd;

    if (hardEnd < source.length) {
      const searchStart = Math.max(cursor, hardEnd - 900);
      const boundaryWindow = source.slice(searchStart, hardEnd);
      const candidates = [
        boundaryWindow.lastIndexOf('\n\nQ'),
        boundaryWindow.lastIndexOf('\n\nQuestion'),
        boundaryWindow.lastIndexOf('\n\n1.'),
        boundaryWindow.lastIndexOf('\n\n'),
      ].filter((idx) => idx >= 0);

      if (candidates.length) {
        end = searchStart + Math.max(...candidates);
      }

      if (end <= cursor + 1000) {
        end = hardEnd;
      }
    }

    chunks.push(source.slice(cursor, end).trim());
    if (end >= source.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks.filter(Boolean);
}

async function withRetries(task, attempts = AI_PARSE_MAX_RETRIES, baseDelayMs = AI_PARSE_RETRY_BASE_DELAY_MS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delayMs(baseDelayMs * attempt);
      }
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('AI parsing failed.'));
}

async function maybeEnrichWithOcrHints(rawText) {
  const text = String(rawText || '');
  const dataUrlMatches = Array.from(text.matchAll(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi))
    .map((match) => String(match?.[0] || '').replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 3);

  if (!dataUrlMatches.length) return text;
  if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) {
    return `${text}\n\n[OCR-HINT] Embedded images detected. Configure Mathpix (MATHPIX_APP_ID/MATHPIX_APP_KEY) for OCR pre-processing of complex math/image-only content.`;
  }

  const ocrSnippets = [];
  for (const dataUrl of dataUrlMatches) {
    try {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);
      const response = await fetch('https://api.mathpix.com/v3/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          app_id: MATHPIX_APP_ID,
          app_key: MATHPIX_APP_KEY,
        },
        body: JSON.stringify({
          src: dataUrl,
          formats: ['text'],
          data_options: { include_asciimath: true },
        }),
        signal: controller.signal,
      });
      globalThis.clearTimeout(timeout);
      if (!response.ok) continue;
      const payload = await response.json();
      const snippet = String(payload?.text || '').trim();
      if (snippet) ocrSnippets.push(snippet.slice(0, 5000));
    } catch {
      // OCR is optional; skip failures silently.
    }
  }

  if (!ocrSnippets.length) return text;
  return `${text}\n\n[OCR-EXTRACTED-TEXT]\n${ocrSnippets.join('\n\n---\n\n')}`;
}

function normalizeConclusions(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeRichMcqText(String(item || '').replace(/^[\-\u2022\d.()\s]+/, '')))
      .filter(Boolean);
  }

  const text = normalizeRichMcqText(String(value || ''));
  if (!text) return [];

  return text
    .split(/\n+|(?<=[.!?])\s+(?=(?:therefore|thus|hence|so|conclusion|inference|result|finally)\b)/i)
    .map((item) => normalizeRichMcqText(item.replace(/^[\-\u2022\d.()\s]+/, '')))
    .filter(Boolean);
}

function splitQuestionAndConclusions(questionText, explicitConclusions = []) {
  const normalizedQuestion = normalizeRichMcqText(String(questionText || ''));
  const conclusionList = normalizeConclusions(explicitConclusions);
  if (!normalizedQuestion) {
    return {
      question: '',
      conclusions: conclusionList,
    };
  }

  const markerMatch = normalizedQuestion.match(/^(.*?)(?:\s*(?:conclusion|inference|therefore|thus|hence|so)\s*[:\-]\s*)([\s\S]+)$/i);
  if (!markerMatch) {
    return {
      question: normalizedQuestion,
      conclusions: conclusionList,
    };
  }

  const questionBody = normalizeRichMcqText(String(markerMatch[1] || ''));
  const markerConclusions = normalizeConclusions(String(markerMatch[2] || ''));
  return {
    question: questionBody || normalizedQuestion,
    conclusions: [...conclusionList, ...markerConclusions],
  };
}

function normalizeAiParsedRows(rows, baseHierarchy, chunkLabel = 'chunk') {
  const parsed = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const splitContent = splitQuestionAndConclusions(String(row?.question || '').replace(/\s+/g, ' ').trim(), row?.conclusions);
    const question = splitContent.question;
    const conclusions = splitContent.conclusions;
    const options = parseOptionsFromUnknown(row?.options).slice(0, 4);
    const answer = resolveAnswerToOption(row?.correctAnswer ?? row?.answer, options);
    const tip = normalizeRichMcqText(row?.explanation || '');
    const difficulty = normalizeDifficulty(row?.difficulty);
    const questionImageRef = String(row?.questionImage || '').trim();
    const explanationImageRef = String(row?.explanationImage || '').trim();
    const optionImageRefs = Array.isArray(row?.optionImages)
      ? row.optionImages.map((item) => String(item || '').trim())
      : [];
    const rowHierarchy = normalizeParsedHierarchyContext({
      subject: row?.subject || baseHierarchy.subject,
      part: row?.part || baseHierarchy.part,
      chapter: row?.chapter || baseHierarchy.chapter,
      section: row?.section || baseHierarchy.section,
      topic: row?.topic || baseHierarchy.topic,
    });

    if (!question) {
      errors.push(`${chunkLabel} Q${idx + 1}: question text is missing.`);
      return;
    }
    if (options.length < 2) {
      errors.push(`${chunkLabel} Q${idx + 1}: at least 2 options are required.`);
      return;
    }
    if (!answer) {
      errors.push(`${chunkLabel} Q${idx + 1}: correct answer is missing.`);
      return;
    }

    parsed.push({
      subject: rowHierarchy.subject,
      part: rowHierarchy.part,
      chapter: rowHierarchy.chapter,
      section: rowHierarchy.section,
      topic: rowHierarchy.topic,
      question,
      questionImageUrl: /^https?:\/\//i.test(questionImageRef) ? questionImageRef : '',
      questionImageDataUrl: /^data:image\//i.test(questionImageRef) ? questionImageRef : '',
      options,
      optionImageDataUrls: optionImageRefs.slice(0, 4).map((ref) => (/^data:image\//i.test(ref) ? ref : '')),
      answer,
      tip,
      conclusions,
      explanationImageDataUrl: /^data:image\//i.test(explanationImageRef) ? explanationImageRef : '',
      difficulty,
    });
  });

  return { parsed, errors };
}

async function parseBulkMcqsWithAi(rawText) {
  const openAiContext = await getOpenAiClientContext();
  const aiClient = openAiContext.client;
  const aiModel = String(openAiContext.model || AI_PARSE_DEFAULT_MODEL).trim() || AI_PARSE_DEFAULT_MODEL;

  if (!aiClient) {
    return { parsed: [], errors: ['OpenAI API is not configured for document parsing. Set OPENAI_API_KEY to continue.'] };
  }

  const inputText = String(rawText || '').trim();
  if (!inputText) {
    return { parsed: [], errors: ['No content found to parse.'] };
  }

  const baseHierarchy = extractHierarchyContextFromText(inputText);
  const clippedText = inputText.length > AI_PARSE_MAX_INPUT_CHARS ? inputText.slice(0, AI_PARSE_MAX_INPUT_CHARS) : inputText;
  const enrichedText = await maybeEnrichWithOcrHints(clippedText);
  const chunks = splitTextIntoParseChunks(enrichedText, AI_PARSE_CHUNK_CHARS, AI_PARSE_CHUNK_OVERLAP);
  if (!chunks.length) {
    return { parsed: [], errors: ['No readable text chunks were generated from this document.'] };
  }

  const chunkTasks = chunks.map((chunk, chunkIndex) => async () => withRetries(async () => {
    const completion = await aiClient.chat.completions.create({
      model: aiModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are an MCQ extraction engine. Return valid JSON only.',
            'Extract ALL MCQs from the chunk using this schema:',
            '{"mcqs":[{"question":"...","conclusions":["..."],"options":["A option","B option","C option","D option"],"correctAnswer":"A|B|C|D|option text","explanation":"...","difficulty":"Easy|Medium|Hard","subject":"","part":"","chapter":"","section":"","topic":"","questionImage":"","optionImages":[""],"explanationImage":""}],"errors":["..."]}',
            'Rules:',
            '- Keep the stem in question and output each inference/conclusion as a separate item in conclusions[].',
            '- Do not merge multiple conclusions into one line; split them into separate array entries.',
            '- Keep exactly 4 options whenever available; map mixed formats to A-D order.',
            '- Preserve inline formatting tags like <strong>, <em>, <b>, <i> if present.',
            '- If answer is textual, map it to the closest option.',
            '- Use empty string when explanation is unavailable.',
            '- Never add markdown code fences.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Chunk ${chunkIndex + 1} of ${chunks.length}`,
            chunk,
          ].join('\n\n'),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsedJson = extractJsonObject(raw);
    const rows = Array.isArray(parsedJson?.mcqs) ? parsedJson.mcqs : [];
    const normalized = normalizeAiParsedRows(rows, baseHierarchy, `chunk-${chunkIndex + 1}`);
    const chunkErrors = Array.isArray(parsedJson?.errors)
      ? parsedJson.errors.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    return {
      parsed: normalized.parsed,
      errors: [...normalized.errors, ...chunkErrors],
    };
  }, AI_PARSE_MAX_RETRIES, AI_PARSE_RETRY_BASE_DELAY_MS));

  const parsedMerged = [];
  const errorsMerged = [];

  for (let index = 0; index < chunkTasks.length; index += AI_PARSE_PARALLEL_CHUNKS) {
    const batch = chunkTasks.slice(index, index + AI_PARSE_PARALLEL_CHUNKS);
    const results = await Promise.all(batch.map((task) => task().catch((error) => ({
      parsed: [],
      errors: [error instanceof Error ? error.message : 'Chunk parsing failed.'],
    }))));

    results.forEach((result) => {
      parsedMerged.push(...(result.parsed || []));
      errorsMerged.push(...(result.errors || []));
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const row of parsedMerged) {
    const signature = hashToken([
      row.question,
      ...(Array.isArray(row.options) ? row.options : []),
      row.answer,
    ].join('|').toLowerCase());
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(row);
    if (deduped.length >= BULK_PARSE_LIMIT) break;
  }

  if (!deduped.length) {
    return { parsed: [], errors: errorsMerged.length ? errorsMerged : ['AI parser could not extract valid MCQs.'] };
  }

  return { parsed: deduped, errors: errorsMerged };
}

function parseBulkMcqsFromText(raw) {
  const text = normalizePlainText(raw);
  if (!text) return { parsed: [], errors: ['No content found to parse.'] };

  const baseHierarchy = extractHierarchyContextFromText(text);

  const blocks = splitQuestionBlocks(text);

  const errors = [];
  const parsed = [];
  let skipped = 0;

  const fallbackParseUsingQuestionAndADOptions = () => {
    const fallbackParsed = [];
    const fallbackErrors = [];
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const state = {
      current: null,
      activeOptionKey: '',
      count: 0,
    };

    const commit = () => {
      if (!state.current || fallbackParsed.length >= BULK_PARSE_LIMIT) {
        state.current = null;
        state.activeOptionKey = '';
        return;
      }

      const splitContent = splitQuestionAndConclusions(state.current.questionLines.join(' '));
      const question = splitContent.question;
      const conclusions = splitContent.conclusions;
      const orderedOptions = ['A', 'B', 'C', 'D']
        .map((key) => normalizeRichMcqText(state.current.optionsByKey[key]))
        .filter(Boolean);

      if (!question || orderedOptions.length < 2) {
        state.current = null;
        state.activeOptionKey = '';
        return;
      }

      const resolvedAnswer = resolveAnswerToOption(state.current.answerRaw, orderedOptions) || orderedOptions[0];
      if (!state.current.answerRaw) {
        fallbackErrors.push(`Q${state.current.number}: answer not detected; defaulted to option A/text-first option.`);
      }

      fallbackParsed.push({
        subject: String(state.current.hierarchy.subject || '').trim().toLowerCase(),
        part: String(state.current.hierarchy.part || '').trim().toLowerCase(),
        chapter: String(state.current.hierarchy.chapter || '').trim(),
        section: String(state.current.hierarchy.section || '').trim(),
        topic: String(state.current.hierarchy.topic || '').trim(),
        question,
        questionImageUrl: '',
        questionImageDataUrl: '',
        options: orderedOptions,
        optionImageDataUrls: [],
        answer: resolvedAnswer,
        tip: normalizeRichMcqText(state.current.explanationLines.join('\n')),
        conclusions,
        explanationImageDataUrl: '',
        difficulty: state.current.difficulty,
      });

      state.current = null;
      state.activeOptionKey = '';
    };

    const inlineADRegex = /(?:^|\s)([A-Da-d])[\).:-]\s*([\s\S]*?)(?=(?:\s+[A-Da-d][\).:-]\s*)|$)/g;

    for (const line of lines) {
      const hierarchyLine = parseHierarchyLine(line);
      if (hierarchyLine?.key) {
        if (!state.current) {
          state.current = {
            number: state.count + 1,
            hierarchy: { ...baseHierarchy, [hierarchyLine.key]: hierarchyLine.value },
            questionLines: [],
            optionsByKey: { A: '', B: '', C: '', D: '' },
            answerRaw: '',
            explanationLines: [],
            difficulty: 'Medium',
          };
        } else {
          state.current.hierarchy[hierarchyLine.key] = hierarchyLine.value;
        }
        continue;
      }

      const questionMatch = line.match(/^(?:q(?:uestion)?\s*)?(\d{1,3})(?:\s*[\).:-])\s*(.+)$/i);
      if (questionMatch) {
        commit();
        state.count += 1;
        state.current = {
          number: state.count,
          hierarchy: { ...baseHierarchy },
          questionLines: [String(questionMatch[2] || '').trim()],
          optionsByKey: { A: '', B: '', C: '', D: '' },
          answerRaw: '',
          explanationLines: [],
          difficulty: 'Medium',
        };
        continue;
      }

      if (!state.current) {
        continue;
      }

      const answerMatch = line.match(/^(?:correct\s*answer|correct\s*option|correct|answer|ans(?:wer)?\.?)\s*[:=-]\s*(.+)$/i);
      if (answerMatch) {
        state.current.answerRaw = String(answerMatch[1] || '').trim();
        state.activeOptionKey = '';
        continue;
      }

      const difficultyMatch = line.match(/^(?:difficulty|level)\s*[:=-]\s*(easy|medium|hard)$/i);
      if (difficultyMatch) {
        state.current.difficulty = normalizeDifficulty(difficultyMatch[1]);
        continue;
      }

      const explanationMatch = line.match(/^(?:explanation|solution|reason|short\s*trick|tip)\s*[:=-]?\s*(.*)$/i);
      if (explanationMatch) {
        const detail = String(explanationMatch[1] || '').trim();
        if (detail) state.current.explanationLines.push(detail);
        state.activeOptionKey = '';
        continue;
      }

      const singleOptionMatch = line.match(/^(?:option\s*)?([A-Da-d])[\).:-]\s*(.+)$/i);
      if (singleOptionMatch) {
        const key = String(singleOptionMatch[1] || '').toUpperCase();
        state.current.optionsByKey[key] = String(singleOptionMatch[2] || '').trim();
        state.activeOptionKey = key;
        continue;
      }

      const inlineOptions = [];
      inlineADRegex.lastIndex = 0;
      let inlineMatch;
      while ((inlineMatch = inlineADRegex.exec(line)) !== null) {
        inlineOptions.push({ key: String(inlineMatch[1] || '').toUpperCase(), text: String(inlineMatch[2] || '').trim() });
      }
      if (inlineOptions.length >= 2) {
        inlineOptions.forEach((item) => {
          if (['A', 'B', 'C', 'D'].includes(item.key) && item.text) {
            state.current.optionsByKey[item.key] = item.text;
          }
        });
        state.activeOptionKey = '';
        continue;
      }

      if (state.activeOptionKey && state.current.optionsByKey[state.activeOptionKey]) {
        state.current.optionsByKey[state.activeOptionKey] = `${state.current.optionsByKey[state.activeOptionKey]} ${line}`.trim();
      } else {
        state.current.questionLines.push(line);
      }
    }

    commit();

    if (fallbackParsed.length === 0) {
      fallbackErrors.push('Fallback parser could not detect question/option patterns (A-D).');
    }

    return { fallbackParsed, fallbackErrors };
  };

  blocks.forEach((block) => {
    if (parsed.length >= BULK_PARSE_LIMIT) return;

    const lines = block.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return;

    lines[0] = lines[0].replace(/^(?:q(?:uestion)?\s*)?\d{1,3}(?:\s*[\).:-])?\s*/i, '').trim();

    let questionImageUrl = '';
    let questionImageDataUrl = '';
    let answer = '';
    const explanationLines = [];
    let explanationImageDataUrl = '';
    let difficulty = 'Medium';
    const questionLines = [];
    const options = [];
    const blockHierarchy = {
      ...baseHierarchy,
    };
    let capturingExplanation = false;
    let activeOptionIndex = -1;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const hierarchyLine = parseHierarchyLine(line);
      if (hierarchyLine?.key) {
        blockHierarchy[hierarchyLine.key] = hierarchyLine.value;
        continue;
      }

      const imageRef = extractImageReference(line);
      if (imageRef) {
        const isDataUrl = /^data:image\//i.test(imageRef);
        const optionImageLabel = line.match(/option\s*([A-H]|\d{1,2})\s*image/i);

        if (optionImageLabel) {
          const token = optionImageLabel[1];
          const optionIndex = /^\d+$/.test(token)
            ? Number(token) - 1
            : token.toUpperCase().charCodeAt(0) - 65;
          if (optionIndex >= 0 && optionIndex < options.length) {
            options[optionIndex].imageDataUrl = isDataUrl ? imageRef : '';
          }
          continue;
        }

        if (/explanation\s*image|solution\s*image|tip\s*image/i.test(line) || capturingExplanation) {
          explanationImageDataUrl = isDataUrl ? imageRef : explanationImageDataUrl;
          continue;
        }

        if (activeOptionIndex >= 0 && activeOptionIndex < options.length) {
          options[activeOptionIndex].imageDataUrl = isDataUrl ? imageRef : '';
          continue;
        }

        if (isDataUrl) {
          questionImageDataUrl = imageRef;
        } else {
          questionImageUrl = imageRef;
        }
        continue;
      }

      const answerMatch = line.match(/^(?:correct\s*answer|correct\s*option|correct|answer|ans(?:wer)?\.?)\s*[:=-]\s*(.+)$/i);
      if (answerMatch) {
        answer = answerMatch[1].trim();
        capturingExplanation = false;
        activeOptionIndex = -1;
        continue;
      }

      const explanationMatch = line.match(/^(?:explanation|solution|reason|short\s*trick|tip)\s*[:=-]?\s*(.*)$/i);
      if (explanationMatch) {
        if (explanationMatch[1].trim()) explanationLines.push(explanationMatch[1].trim());
        capturingExplanation = true;
        activeOptionIndex = -1;
        continue;
      }

      const difficultyMatch = line.match(/^(?:difficulty|level)\s*[:=-]\s*(easy|medium|hard)$/i);
      if (difficultyMatch) {
        const normalized = difficultyMatch[1].toLowerCase();
        difficulty = normalized === 'easy' ? 'Easy' : normalized === 'hard' ? 'Hard' : 'Medium';
        continue;
      }

      const inlineOptions = splitInlineOptions(line);
      if (inlineOptions.length) {
        inlineOptions.forEach((optionText) => {
          options.push({ text: optionText, imageDataUrl: '' });
        });
        capturingExplanation = false;
        activeOptionIndex = options.length - 1;
        continue;
      }

      const optionMatch = line.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\s*[\).:-])\s*(.+)$/i);
      if (optionMatch) {
        options.push({ text: optionMatch[2].trim(), imageDataUrl: '' });
        capturingExplanation = false;
        activeOptionIndex = options.length - 1;
        continue;
      }

      if (capturingExplanation) {
        explanationLines.push(line);
      } else if (activeOptionIndex >= 0 && options[activeOptionIndex]) {
        options[activeOptionIndex].text = `${options[activeOptionIndex].text} ${line}`.trim();
      } else {
        questionLines.push(line);
      }
    }

    const splitContent = splitQuestionAndConclusions(questionLines.join(' '));
    const question = splitContent.question;
    const conclusions = splitContent.conclusions;
    const normalizedOptions = options.map((option) => normalizeRichMcqText(option.text)).filter(Boolean);
    const resolvedAnswer = resolveAnswerToOption(answer, normalizedOptions);
    if ((!question && !questionImageUrl && !questionImageDataUrl) || normalizedOptions.length < 2 || !resolvedAnswer) {
      skipped += 1;
      return;
    }

    parsed.push({
      subject: String(blockHierarchy.subject || '').trim().toLowerCase(),
      part: String(blockHierarchy.part || '').trim().toLowerCase(),
      chapter: String(blockHierarchy.chapter || '').trim(),
      section: String(blockHierarchy.section || '').trim(),
      topic: String(blockHierarchy.topic || '').trim(),
      question: question || 'Refer to attached image.',
      questionImageUrl,
      questionImageDataUrl,
      options: normalizedOptions,
      optionImageDataUrls: options.map((option) => option.imageDataUrl || ''),
      answer: resolvedAnswer,
      tip: normalizeRichMcqText(explanationLines.join('\n')),
      conclusions,
      explanationImageDataUrl,
      difficulty,
    });
  });

  if (blocks.length > BULK_PARSE_LIMIT) {
    errors.push(`Only the first ${BULK_PARSE_LIMIT} MCQs were kept from this import.`);
  }
  if (skipped > 0) {
    errors.push(`Skipped ${skipped} unclear block(s) and continued parsing the rest.`);
  }

  if (!parsed.length) {
    const fallback = fallbackParseUsingQuestionAndADOptions();
    if (fallback.fallbackParsed.length) {
      return {
        parsed: fallback.fallbackParsed,
        errors: [...errors, ...fallback.fallbackErrors, 'Primary parser missed MCQs; fallback parser was used.'],
      };
    }
    return { parsed, errors: [...errors, ...fallback.fallbackErrors] };
  }

  return { parsed, errors };
}

function normalizeStructuredSourceHtml(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferPdfTextStyle(item, styles) {
  const styleInfo = styles && item?.fontName ? styles[item.fontName] : null;
  const fontName = String(item?.fontName || '');
  const fontFamily = String(styleInfo?.fontFamily || '');
  const hint = `${fontName} ${fontFamily}`.toLowerCase();

  const isBold = /(bold|black|heavy|demi|semibold|extrabold|medium)/i.test(hint);
  const isItalic = /(italic|oblique)/i.test(hint);

  return { isBold, isItalic };
}

function wrapWithFormattingTags(text, style) {
  const safeText = escapeHtml(String(text || ''));
  if (!safeText.trim()) return '';

  let result = safeText;
  if (style?.isItalic) {
    result = `<em>${result}</em>`;
  }
  if (style?.isBold) {
    result = `<strong>${result}</strong>`;
  }
  return result;
}

function buildPdfStructuredHtmlPage(textContent) {
  const items = Array.isArray(textContent?.items) ? textContent.items : [];
  const styles = textContent?.styles || {};
  if (!items.length) return '';

  const lines = [];
  let currentLineY = null;
  let currentLine = '';

  const flushLine = () => {
    const trimmed = currentLine.trim();
    if (trimmed) lines.push(trimmed);
    currentLine = '';
  };

  items.forEach((item) => {
    const rawText = String(item?.str || '');
    if (!rawText) return;

    const y = Number(Array.isArray(item?.transform) ? item.transform[5] : Number.NaN);
    const hasY = Number.isFinite(y);

    if (hasY && currentLineY != null && Math.abs(y - currentLineY) > 2.5) {
      flushLine();
    }

    if (hasY) currentLineY = y;

    const style = inferPdfTextStyle(item, styles);
    const token = wrapWithFormattingTags(rawText, style);
    if (!token) return;

    if (currentLine && !/^\s/.test(rawText)) {
      currentLine += ' ';
    }
    currentLine += token;
  });

  flushLine();
  return lines.join('\n');
}

async function extractTextFromUpload(filePayload) {
  const fileName = String(filePayload?.name || '').trim();
  const extension = path.extname(fileName).toLowerCase();
  const fileMeta = parseDataUrl(filePayload?.dataUrl);
  if (!fileMeta?.buffer?.length) {
    throw new Error('Uploaded file data is invalid.');
  }

  const mimeType = String(filePayload?.mimeType || fileMeta.mimeType || '').toLowerCase().trim();
  const sizeBytes = Number(filePayload?.size || fileMeta.buffer.length || 0);
  if (!sizeBytes || sizeBytes > AI_PARSE_MAX_FILE_BYTES) {
    throw new Error(`Uploaded file must be between 1 byte and ${AI_PARSE_MAX_FILE_MB} MB.`);
  }

  if (mimeType.includes('pdf') || extension === '.pdf') {
    const parsed = await pdfParse(fileMeta.buffer, {
      pagerender: (pageData) => pageData
        .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then((textContent) => buildPdfStructuredHtmlPage(textContent)),
    });

    const structured = String(parsed?.text || '');
    return normalizeStructuredSourceHtml(structured);
  }

  if (
    mimeType.includes('officedocument.wordprocessingml.document')
    || extension === '.docx'
  ) {
    const result = await mammoth.convertToHtml(
      { buffer: fileMeta.buffer },
      {
        convertImage: mammoth.images.inline(async (image) => {
          try {
            const base64 = await image.read('base64');
            const contentType = String(image.contentType || 'image/png').toLowerCase();
            return {
              src: `data:${contentType};base64,${base64}`,
            };
          } catch {
            return { src: '' };
          }
        }),
      },
    );

    const $ = cheerio.load(String(result?.value || ''));
    const chunks = [];
    const inlineTextTags = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'a']);
    const blockTags = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td']);

    const pushChunk = (value) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return;
      chunks.push(normalized);
    };

    const traverse = (node) => {
      if (!node) return;

      if (node.type === 'text') {
        pushChunk(node.data);
        return;
      }

      if (node.type !== 'tag') return;

      const tag = String(node.name || '').toLowerCase();
      const styleAttr = String($(node).attr('style') || '').toLowerCase();
      const isBoldNode = tag === 'strong' || tag === 'b' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(styleAttr);
      const isItalicNode = tag === 'em' || tag === 'i' || /font-style\s*:\s*(italic|oblique)/i.test(styleAttr);
      if (tag === 'img') {
        const src = String($(node).attr('src') || '').trim();
        if (/^data:image\//i.test(src)) {
          chunks.push(`image: ${src}`);
        }
        return;
      }

      if (tag === 'br') {
        chunks.push('\n');
        return;
      }

      if (blockTags.has(tag)) chunks.push('\n');
      if (isBoldNode) chunks.push('<strong>');
      if (isItalicNode) chunks.push('<em>');

      const children = node.children || [];
      for (const child of children) {
        traverse(child);
      }

      if (isItalicNode) chunks.push('</em>');
      if (isBoldNode) chunks.push('</strong>');

      if (blockTags.has(tag) || !inlineTextTags.has(tag)) chunks.push('\n');
    };

    const rootNodes = $('body').length ? $('body').contents().toArray() : $.root().contents().toArray();
    rootNodes.forEach((node) => traverse(node));

    const assembled = chunks
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');

    return normalizeStructuredSourceHtml(assembled);
  }

  if (mimeType.includes('msword') || extension === '.doc') {
    // Legacy DOC is often binary; this fallback extracts any readable text blocks.
    const text = normalizePlainText(fileMeta.buffer.toString('latin1'));
    if (!text || text.length < 25) {
      throw new Error('Could not reliably parse this DOC file. Please save it as DOCX and upload again.');
    }
    return text;
  }

  if (mimeType.includes('text/plain') || extension === '.txt') {
    return normalizePlainText(fileMeta.buffer.toString('utf8'));
  }

  throw new Error('Unsupported file type. Upload PDF, DOC, DOCX, or TXT.');
}

async function checkSubmissionRestriction(actorKey) {
  if (!actorKey) return { restricted: false, blockedUntil: null };
  const restriction = await SubmissionRestrictionModel.findOne({ actorKey }).lean();
  if (!restriction?.blockedUntil) {
    return { restricted: false, blockedUntil: null };
  }

  const blockedUntil = new Date(restriction.blockedUntil);
  if (Number.isNaN(blockedUntil.getTime()) || blockedUntil.getTime() <= Date.now()) {
    return { restricted: false, blockedUntil: null };
  }

  return {
    restricted: true,
    blockedUntil: blockedUntil.toISOString(),
    reason: String(restriction.reason || '').trim(),
  };
}

async function blockSubmissionActor(actorKey, reason, durationMinutes) {
  if (!actorKey) return null;
  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  await SubmissionRestrictionModel.findOneAndUpdate(
    { actorKey },
    {
      $set: {
        blockedUntil,
        reason: String(reason || '').trim(),
        lastViolationAt: new Date(),
      },
      $setOnInsert: {
        actorKey,
      },
    },
    { upsert: true, new: true },
  );
  return blockedUntil.toISOString();
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function isValidObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function makeAccessToken(user) {
  const payload = {
    userId: String(user._id),
    email: user.email,
    role: user.role || 'student',
  };

  if ((user.role || 'student') === 'student' && user.activeSession?.sessionId) {
    payload.sessionId = user.activeSession.sessionId;
  }

  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function makeRefreshToken(user) {
  const payload = {
    userId: String(user._id),
    type: 'refresh',
    role: user.role || 'student',
  };

  if ((user.role || 'student') === 'student' && user.activeSession?.sessionId) {
    payload.sessionId = user.activeSession.sessionId;
  }

  return jwt.sign(
    payload,
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` },
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  const normalized = normalizeEmail(value);
  if (!normalized || normalized.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

function sanitizeHumanName(value, maxLen = 80) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizePlainText(value, maxLen = 240) {
  return String(value || '')
    .replace(/[\u0000<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function normalizeSecurityQuestion(value) {
  return sanitizePlainText(value, 180);
}

function normalizeSecurityAnswer(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 180);
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').trim().slice(0, 120);
}

function getUserAgent(req) {
  return String(req.get('user-agent') || '').trim().slice(0, 240);
}

function normalizeMobileNumber(value) {
  return String(value || '').trim();
}

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'hbl') return 'bank_transfer';
  return method;
}

function normalizeContactMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'phone' || method === 'sms' || method === 'email' || method === 'whatsapp') return 'whatsapp';
  return '';
}

function isValidMobileNumber(value) {
  const cleaned = String(value || '').replace(/[\s()-]/g, '');
  return /^\+?[0-9]{8,18}$/.test(cleaned);
}

function isValidWhatsAppNumber(value) {
  const cleaned = String(value || '').replace(/[\s()-]/g, '');
  return /^\+[1-9][0-9]{7,14}$/.test(cleaned);
}

function compactMobile(value) {
  return String(value || '').replace(/\D/g, '');
}

function getDuplicateAccountFieldLabel(matchedBy) {
  if (matchedBy === 'email') return 'email address';
  if (matchedBy === 'mobile') return 'mobile number';
  return 'email address or mobile number';
}

function duplicateAccountErrorMessage(matchedBy, hasActiveSubscription) {
  const fieldLabel = getDuplicateAccountFieldLabel(matchedBy);
  if (hasActiveSubscription) {
    return `An active account already exists with this ${fieldLabel}. Please log in using your existing account, or use a different email address or mobile number to create a new account.`;
  }
  return `An account already exists with this ${fieldLabel}. Please log in using your existing account, or use a different email address or mobile number.`;
}

async function findUserByMobileNumber(mobileNumber) {
  const targetCompact = compactMobile(mobileNumber);
  if (!targetCompact) return null;

  const exact = await UserModel.findOne({ phone: mobileNumber })
    .select('email phone subscription')
    .lean();
  if (exact && compactMobile(exact.phone) === targetCompact) {
    return exact;
  }

  // Fallback scan allows matching different formatting (+92..., spaces, dashes).
  const candidates = await UserModel.find({ phone: { $exists: true, $ne: '' } })
    .select('email phone subscription')
    .lean();

  return candidates.find((item) => compactMobile(item.phone) === targetCompact) || null;
}

async function findUserDocumentByMobileNumber(mobileNumber) {
  const targetCompact = compactMobile(mobileNumber);
  if (!targetCompact) return null;

  const exact = await UserModel.findOne({ phone: mobileNumber });
  if (exact && compactMobile(exact.phone) === targetCompact) {
    return exact;
  }

  const candidates = await UserModel.find({ phone: { $exists: true, $ne: '' } });
  return candidates.find((item) => compactMobile(item.phone) === targetCompact) || null;
}

function hasActiveSubscription(userLike) {
  return isSubscriptionActive(normalizeSubscription(userLike));
}

function normalizePaymentProofMime(value) {
  const mime = String(value || '').trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'application/x-pdf') return 'application/pdf';
  return mime;
}

function inferPaymentProofMimeFromName(fileName) {
  const name = String(fileName || '').trim().toLowerCase();
  if (!name.includes('.')) return '';
  const ext = name.split('.').pop() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return '';
}

function serializePasswordRecoveryRequest(item) {
  return {
    id: String(item._id),
    identifier: String(item.identifier || ''),
    matchedBy: String(item.matchedBy || 'none'),
    userId: item.userId ? String(item.userId) : '',
    userName: String(item.userName || ''),
    email: String(item.email || ''),
    mobileNumber: String(item.mobileNumber || ''),
    recoveryStatus: String(item.recoveryStatus || 'failed'),
    dispatches: Array.isArray(item.dispatches)
      ? item.dispatches.map((dispatch) => ({
        channel: String(dispatch.channel || ''),
        destination: String(dispatch.destination || ''),
        status: String(dispatch.status || ''),
        provider: String(dispatch.provider || ''),
        detail: String(dispatch.detail || ''),
      }))
      : [],
    tokenExpiresAt: item.tokenExpiresAt ? new Date(item.tokenExpiresAt).toISOString() : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

async function sendRecoveryEmail(destination, token, expiresInMinutes = 30) {
  if (!isValidEmail(destination)) {
    return {
      channel: 'email',
      destination,
      status: 'failed',
      provider: 'smtp-gmail',
      detail: 'No valid email available for delivery.',
    };
  }

  if (!smtpTransporter || !SMTP_FROM_EMAIL) {
    return {
      channel: 'email',
      destination,
      status: 'failed',
      provider: 'smtp-gmail',
      detail: 'SMTP provider not configured.',
    };
  }

  try {
    await smtpTransporter.sendMail({
      from: SMTP_FROM_EMAIL,
      to: destination,
      subject: 'NET360 Password Recovery Token',
      text: `Your NET360 reset token is: ${token}. It expires in ${expiresInMinutes} minutes.`,
      html: `<p>Your NET360 reset token is: <strong>${token}</strong></p><p>This token expires in ${expiresInMinutes} minutes.</p>`,
    });

    return {
      channel: 'email',
      destination,
      status: 'sent',
      provider: 'smtp-gmail',
      detail: 'Recovery token sent.',
    };
  } catch (error) {
    return {
      channel: 'email',
      destination,
      status: 'failed',
      provider: 'smtp-gmail',
      detail: error instanceof Error ? error.message : 'Email provider error.',
    };
  }
}

async function sendRecoverySms(destination, token, expiresInMinutes = 30) {
  if (!isValidMobileNumber(destination)) {
    return {
      channel: 'sms',
      destination,
      status: 'failed',
      provider: 'twilio-sms',
      detail: 'No valid mobile number available for delivery.',
    };
  }

  if (!twilioClient || !TWILIO_PHONE_NUMBER) {
    return {
      channel: 'sms',
      destination,
      status: 'failed',
      provider: 'twilio-sms',
      detail: 'Twilio SMS provider not configured.',
    };
  }

  try {
    await twilioClient.messages.create({
      to: destination,
      from: TWILIO_PHONE_NUMBER,
      body: `NET360 reset token: ${token}. Expires in ${expiresInMinutes} minutes.`,
    });

    return {
      channel: 'sms',
      destination,
      status: 'sent',
      provider: 'twilio-sms',
      detail: 'Recovery token sent.',
    };
  } catch (error) {
    return {
      channel: 'sms',
      destination,
      status: 'failed',
      provider: 'twilio-sms',
      detail: error instanceof Error ? error.message : 'SMS provider error.',
    };
  }
}

async function sendRecoveryWhatsApp(destination, token, expiresInMinutes = 30) {
  if (!isValidMobileNumber(destination)) {
    return {
      channel: 'whatsapp',
      destination,
      status: 'failed',
      provider: 'twilio-whatsapp',
      detail: 'No valid mobile number available for delivery.',
    };
  }

  if (!twilioClient || !TWILIO_WHATSAPP_FROM) {
    return {
      channel: 'whatsapp',
      destination,
      status: 'failed',
      provider: 'twilio-whatsapp',
      detail: 'Twilio WhatsApp provider not configured.',
    };
  }

  const to = destination.startsWith('whatsapp:') ? destination : `whatsapp:${destination}`;

  try {
    await twilioClient.messages.create({
      to,
      from: TWILIO_WHATSAPP_FROM,
      body: `NET360 reset token: ${token}. Expires in ${expiresInMinutes} minutes.`,
    });

    return {
      channel: 'whatsapp',
      destination,
      status: 'sent',
      provider: 'twilio-whatsapp',
      detail: 'Recovery token sent.',
    };
  } catch (error) {
    return {
      channel: 'whatsapp',
      destination,
      status: 'failed',
      provider: 'twilio-whatsapp',
      detail: error instanceof Error ? error.message : 'WhatsApp provider error.',
    };
  }
}

function normalizePaymentProof(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Payment proof file is required.');
  }

  const name = sanitizePlainText(input.name || '', 120);
  const dataUrl = String(input.dataUrl || '').trim();
  const parsed = parseDataUrl(dataUrl);
  if (!name || !parsed?.buffer?.length) {
    throw new Error('Payment proof must include a valid file name and file data.');
  }

  const providedMime = normalizePaymentProofMime(input.mimeType || '');
  const parsedMime = normalizePaymentProofMime(parsed.mimeType || '');
  const inferredMime = inferPaymentProofMimeFromName(name);
  const mimeType = [providedMime, parsedMime, inferredMime].find((candidate) => PAYMENT_PROOF_ALLOWED_MIME_TYPES.has(candidate));
  if (!PAYMENT_PROOF_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Payment proof must be JPG, PNG, or PDF.');
  }

  const size = Number(input.size || parsed.buffer.length || 0);
  if (!size || size > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error('Payment proof must be up to 5MB.');
  }

  return {
    name,
    mimeType,
    size,
    dataUrl,
  };
}

function normalizeConfigKey(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidConfigKey(value) {
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(String(value || ''));
}

function encryptConfigValue(plainText) {
  if (!CONFIG_CRYPTO_KEY) {
    throw new Error('CONFIG_ENCRYPTION_KEY is missing on server.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CONFIG_CRYPTO_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptConfigValue(cipherText) {
  if (!CONFIG_CRYPTO_KEY) {
    throw new Error('CONFIG_ENCRYPTION_KEY is missing on server.');
  }

  const raw = String(cipherText || '');
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted config payload.');
  }

  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', CONFIG_CRYPTO_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskConfigValue(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 4) return '*'.repeat(text.length);
  return `${text.slice(0, 2)}${'*'.repeat(Math.max(4, text.length - 4))}${text.slice(-2)}`;
}

async function readRuntimeConfigMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && runtimeConfigCache.fetchedAt > 0 && (now - runtimeConfigCache.fetchedAt) < RUNTIME_CONFIG_CACHE_MS) {
    return runtimeConfigCache.valueByKey;
  }

  const rows = await RuntimeConfigModel.find({}).select('key encryptedValue').lean();
  const next = new Map();
  for (const row of rows) {
    const key = normalizeConfigKey(row?.key || '');
    if (!key || !row?.encryptedValue) continue;
    try {
      next.set(key, decryptConfigValue(row.encryptedValue));
    } catch {
      // Ignore broken encrypted entries to keep app running.
    }
  }

  runtimeConfigCache.valueByKey = next;
  runtimeConfigCache.fetchedAt = now;
  return next;
}

function clearRuntimeConfigCache() {
  runtimeConfigCache.valueByKey = new Map();
  runtimeConfigCache.fetchedAt = 0;
}

async function getRuntimeConfigValue(key, fallback = '') {
  const normalized = normalizeConfigKey(key);
  if (!normalized) return fallback;
  const map = await readRuntimeConfigMap(false);
  if (map.has(normalized)) return String(map.get(normalized) || '');
  return fallback;
}

async function getOpenAiRuntimeSettings() {
  const runtimeModel = await getRuntimeConfigValue('MODEL_PROVIDER_MODEL', '');
  const runtimeOpenAiModel = await getRuntimeConfigValue('OPENAI_MODEL', '');
  const runtimeProviderKey = await getRuntimeConfigValue('MODEL_PROVIDER_API_KEY', '');
  const runtimeOpenAiKey = await getRuntimeConfigValue('OPENAI_API_KEY', '');

  const model = runtimeModel || runtimeOpenAiModel || OPENAI_MODEL;
  const apiKey = runtimeProviderKey || runtimeOpenAiKey || MODEL_PROVIDER_KEY;
  const keySource = runtimeProviderKey
    ? 'MODEL_PROVIDER_API_KEY'
    : runtimeOpenAiKey
      ? 'OPENAI_API_KEY'
      : process.env.MODEL_PROVIDER_API_KEY
        ? 'MODEL_PROVIDER_API_KEY'
        : process.env.OPENAI_API_KEY
          ? 'OPENAI_API_KEY'
          : 'missing';

  return { model, apiKey, keySource };
}

async function getOpenAiClientContext() {
  const settings = await getOpenAiRuntimeSettings();
  return {
    model: settings.model,
    keySource: settings.keySource,
    client: settings.apiKey ? new OpenAI({ apiKey: settings.apiKey }) : null,
  };
}

function classifyOpenAiError(error) {
  const status = Number(error?.status || error?.statusCode || 0) || undefined;
  const code = String(error?.code || error?.error?.code || '').trim();
  const type = String(error?.type || error?.error?.type || '').trim();
  const message = String(error?.message || 'OpenAI request failed.').trim();
  const lowered = `${code} ${type} ${message}`.toLowerCase();

  if (status === 401 || lowered.includes('invalid_api_key') || lowered.includes('incorrect api key') || lowered.includes('authentication')) {
    return {
      category: 'auth',
      status: 401,
      code: code || 'invalid_api_key',
      message: 'OpenAI authentication failed. Verify OPENAI_API_KEY on the backend .env/runtime config.',
      detail: message,
    };
  }

  if (status === 429 || lowered.includes('insufficient_quota') || lowered.includes('quota') || lowered.includes('rate limit')) {
    return {
      category: 'quota',
      status: 429,
      code: code || 'insufficient_quota',
      message: 'OpenAI quota/rate limit reached. Check billing, quota limits, and retry policy.',
      detail: message,
    };
  }

  return {
    category: 'unknown',
    status: status || 502,
    code: code || undefined,
    message: 'OpenAI connection failed. Check API key, model, and network connectivity.',
    detail: message,
  };
}

async function runOpenAiConnectionProbe(reason = 'runtime-check') {
  const openAiContext = await getOpenAiClientContext();
  const configured = Boolean(openAiContext.client);
  const keySource = openAiContext.keySource;
  const model = String(openAiContext.model || OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  if (!configured) {
    return {
      ok: false,
      configured: false,
      keySource,
      model,
      category: 'missing-key',
      status: 503,
      message: 'OpenAI API key is missing. Set process.env.OPENAI_API_KEY (or MODEL_PROVIDER_API_KEY) on the backend.',
      detail: 'No OpenAI API key is currently loaded from runtime config or environment variables.',
      checkedAt: new Date().toISOString(),
      reason,
    };
  }

  try {
    await openAiContext.client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 5,
      messages: [
        { role: 'system', content: 'Respond with one short token: ok' },
        { role: 'user', content: 'ping' },
      ],
    });

    return {
      ok: true,
      configured: true,
      keySource,
      model,
      category: 'ok',
      status: 200,
      message: 'OpenAI API key loaded and API connection successful.',
      detail: 'Probe request completed successfully.',
      checkedAt: new Date().toISOString(),
      reason,
    };
  } catch (error) {
    const classified = classifyOpenAiError(error);
    return {
      ok: false,
      configured: true,
      keySource,
      model,
      category: classified.category,
      status: classified.status,
      code: classified.code,
      message: classified.message,
      detail: classified.detail,
      checkedAt: new Date().toISOString(),
      reason,
    };
  }
}

function logOpenAiProbeStatus(probeResult) {
  if (probeResult.ok) {
    console.log(`[openai] API key loaded successfully (source: ${probeResult.keySource}).`);
    console.log(`[openai] API connection successful (model: ${probeResult.model}).`);
    return;
  }

  if (probeResult.category === 'missing-key') {
    console.error('[openai] API key missing or not loaded. Set OPENAI_API_KEY (or MODEL_PROVIDER_API_KEY) in backend env/runtime config.');
    return;
  }

  if (probeResult.category === 'auth') {
    console.error(`[openai] Authentication error: ${probeResult.detail}`);
    return;
  }

  if (probeResult.category === 'quota') {
    console.error(`[openai] Quota/rate-limit error: ${probeResult.detail}`);
    return;
  }

  console.error(`[openai] Connection error: ${probeResult.detail}`);
}

function buildSafeDownloadName(rawName, fallback = 'payment-proof') {
  const base = String(rawName || '').trim() || fallback;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function streamPaymentProofFromDataUrl(res, paymentProof = {}, fallbackName = 'payment-proof') {
  const parsed = parseDataUrl(paymentProof.dataUrl || '');
  if (!parsed?.buffer || !parsed.buffer.length) return false;

  const fileName = buildSafeDownloadName(paymentProof.name, fallbackName);
  const mimeType = String(paymentProof.mimeType || parsed.mimeType || 'application/octet-stream').trim().toLowerCase();
  const download = String(res.req?.query?.download || '') === '1';
  const disposition = download ? 'attachment' : 'inline';

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(parsed.buffer.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
  res.send(parsed.buffer);
  return true;
}

function serializeSignupRequest(item) {
  return {
    id: String(item._id),
    email: item.email,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    mobileNumber: item.mobileNumber || '',
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    paymentTransactionId: item.paymentTransactionId,
    paymentProof: {
      name: String(item.paymentProof?.name || ''),
      mimeType: String(item.paymentProof?.mimeType || ''),
      size: Number(item.paymentProof?.size || 0),
      dataUrl: String(item.paymentProof?.dataUrl || ''),
    },
    contactMethod: 'in_app',
    contactValue: String(item.mobileNumber || ''),
    status: item.status,
    notes: item.notes || '',
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
    reviewedByEmail: item.reviewedByEmail || '',
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

function serializePremiumSubscriptionRequest(item, planName = '') {
  return {
    id: String(item._id),
    userId: String(item.userId || ''),
    email: item.email,
    mobileNumber: item.mobileNumber || '',
    planId: String(item.planId || ''),
    planName,
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    paymentTransactionId: item.paymentTransactionId,
    paymentProof: {
      name: String(item.paymentProof?.name || ''),
      mimeType: String(item.paymentProof?.mimeType || ''),
      size: Number(item.paymentProof?.size || 0),
      dataUrl: String(item.paymentProof?.dataUrl || ''),
    },
    contactMethod: 'in_app',
    contactValue: String(item.mobileNumber || ''),
    status: String(item.status || 'pending'),
    notes: String(item.notes || ''),
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
    reviewedByEmail: String(item.reviewedByEmail || ''),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

function sanitizeDeviceId(value) {
  const cleaned = String(value || '').trim();
  if (cleaned) return cleaned.slice(0, 200);
  return `ua:${hashToken(String(value || '')).slice(0, 16)}`;
}

function generateSignupTokenCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i += 1) {
    token += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return token;
}

function generatePremiumTokenCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let block = 0; block < 3; block += 1) {
    let token = '';
    for (let i = 0; i < 4; i += 1) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    parts.push(token);
  }
  return `PREM-${parts.join('-')}`;
}

function defaultPreferences() {
  return {
    emailNotifications: true,
    dailyReminders: true,
    performanceReports: true,
  };
}

function defaultProgress() {
  return {
    questionsSolved: 0,
    testsCompleted: 0,
    averageScore: 0,
    completedTests: [],
    scores: [],
    studyHours: 0,
    weakTopics: [],
    practiceHistory: [],
    analytics: {
      weeklyProgress: [],
      accuracyTrend: [],
      subjectInsights: [],
      averageSecondsPerQuestion: 0,
      adaptiveProfile: {
        level: 'balanced',
        strengths: [],
        weaknesses: [],
      },
    },
    studyPlan: null,
  };
}

function defaultSubscription() {
  return {
    status: 'inactive',
    planId: '',
    billingCycle: '',
    startedAt: null,
    expiresAt: null,
    paymentReference: '',
    lastActivatedAt: null,
  };
}

function toPlainRecord(value) {
  if (!value || typeof value !== 'object') return {};
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  if (value._doc && typeof value._doc === 'object') {
    return value._doc;
  }
  return value;
}

function normalizeSubscription(user) {
  const plainUser = toPlainRecord(user);
  const userSubscription = plainUser.subscription
    || (typeof user?.get === 'function' ? user.get('subscription') : null)
    || user?.subscription
    || {};
  const plainSubscription = toPlainRecord(userSubscription);

  return {
    ...defaultSubscription(),
    ...plainSubscription,
  };
}

function resolveSubscriptionPlan(planId) {
  return SUBSCRIPTION_PLANS[String(planId || '').trim()] || null;
}

function isSubscriptionActive(subscription) {
  if (!subscription || subscription.status !== 'active') return false;
  if (!subscription.expiresAt) return false;
  return new Date(subscription.expiresAt).getTime() > Date.now();
}

function ensurePremiumAccess(user, res) {
  const subscription = normalizeSubscription(user);
  if (!isSubscriptionActive(subscription)) {
    res.status(402).json({
      error: 'Premium subscription required to access Smart Study Mentor features.',
      code: 'SUBSCRIPTION_REQUIRED',
      subscription,
      plans: Object.values(SUBSCRIPTION_PLANS),
    });
    return null;
  }

  const plan = resolveSubscriptionPlan(subscription.planId);
  if (!plan) {
    res.status(402).json({
      error: 'Your subscription plan is invalid. Please contact support.',
      code: 'PLAN_NOT_FOUND',
      subscription,
    });
    return null;
  }

  return { subscription, plan };
}

function estimateTokenUsage(text) {
  const chars = String(text || '').length;
  return Math.max(80, Math.ceil(chars / 4));
}

function inferSubject(questionText) {
  const text = String(questionText || '').toLowerCase();
  if (/(integration|derivative|matrix|algebra|trigon|vector|equation|limit|function)/.test(text)) return 'Mathematics';
  if (/(force|newton|velocity|acceleration|electric|magnetic|optics|thermo|wave|current)/.test(text)) return 'Physics';
  if (/(mole|reaction|bond|periodic|acid|base|organic|electrochem|hydrocarbon)/.test(text)) return 'Chemistry';
  if (/(grammar|sentence|synonym|antonym|vocabulary|comprehension)/.test(text)) return 'English';
  if (/(cell|genetics|enzyme|reproduction|ecology|respiration)/.test(text)) return 'Biology';
  return 'General';
}

function inferTopic(questionText, subject) {
  const text = String(questionText || '').toLowerCase();
  if (subject === 'Mathematics') {
    if (/integration|integral/.test(text)) return 'Integration';
    if (/derivative|differentiation/.test(text)) return 'Differentiation';
    if (/matrix|determinant/.test(text)) return 'Matrices';
    if (/trigon/.test(text)) return 'Trigonometry';
    return 'Mathematics Core';
  }
  if (subject === 'Physics') {
    if (/newton|force|motion/.test(text)) return 'Mechanics';
    if (/electric|current|voltage/.test(text)) return 'Electricity';
    if (/wave|optics/.test(text)) return 'Waves and Optics';
    return 'Physics Core';
  }
  if (subject === 'Chemistry') {
    if (/organic|hydrocarbon|alkane|alkene/.test(text)) return 'Organic Chemistry';
    if (/equilibrium|mole|stoichiometry/.test(text)) return 'Physical Chemistry';
    return 'Chemistry Core';
  }
  if (subject === 'English') return 'Language Skills';
  if (subject === 'Biology') return 'Biology Core';
  return 'General Problem Solving';
}

function fallbackStructuredSolver(questionText, subject, topic) {
  return {
    conceptExplanation: `This question belongs to ${subject} (${topic}). Start by identifying known values, target variable, and the governing rule/formula before solving.`,
    stepByStepSolution: [
      'Read the question carefully and list what is given and what is required.',
      'Select the correct concept/formula related to the target quantity.',
      'Substitute values with proper units/sign conventions.',
      'Simplify step-by-step and verify each transformation.',
      'Cross-check the result against constraints/options.',
    ],
    finalAnswer: 'Apply the final computed value/result after substitution and simplification.',
    shortestTrick: 'For NET speed, pre-identify the governing formula family and eliminate impossible options before full calculation.',
  };
}

function formatStructuredStudyResponse({ conceptExplanation, steps, finalAnswer, quickTrick }) {
  const stepLines = (steps || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    'Concept Explanation',
    conceptExplanation,
    '',
    'Step-by-Step Solution',
    stepLines,
    '',
    'Final Answer',
    finalAnswer,
    '',
    'Quick Trick or Shortcut Method',
    quickTrick,
  ].join('\n');
}

function normalizeStructuredTutorPayload(input, fallback = null) {
  if (!input || typeof input !== 'object') return fallback;

  const conceptExplanation = String(input.conceptExplanation || '').trim();
  const stepByStepSolution = Array.isArray(input.stepByStepSolution)
    ? input.stepByStepSolution.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const finalAnswer = String(input.finalAnswer || '').trim();
  const shortestTrick = String(input.shortestTrick || '').trim();

  if (!conceptExplanation || !stepByStepSolution.length || !finalAnswer || !shortestTrick) {
    return fallback;
  }

  return {
    conceptExplanation,
    stepByStepSolution,
    finalAnswer,
    shortestTrick,
  };
}

function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeSentenceList(values, maxItems = 7) {
  const seen = new Set();
  const normalized = [];

  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text) continue;
    const comparable = normalizeComparableText(text);
    if (!comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    normalized.push(text);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

function tightenStructuredTutorAnswer(input, fallback = null) {
  const normalized = normalizeStructuredTutorPayload(input, fallback);
  if (!normalized) return fallback;

  const cleanConcept = normalized.conceptExplanation
    .replace(/\s+/g, ' ')
    .replace(/\b(step\s*by\s*step|step-by-step solution)\b[:\-]?/gi, '')
    .trim();

  const cleanSteps = dedupeSentenceList(
    normalized.stepByStepSolution
      .map((step) => step.replace(/^\d+[.)-]?\s*/, '').trim())
      .filter(Boolean),
    6,
  );

  const cleanFinalAnswer = normalized.finalAnswer.replace(/\s+/g, ' ').trim();
  const cleanShortestTrick = normalized.shortestTrick.replace(/\s+/g, ' ').trim();

  if (!cleanConcept || !cleanSteps.length || !cleanFinalAnswer || !cleanShortestTrick) {
    return fallback;
  }

  return {
    conceptExplanation: cleanConcept,
    stepByStepSolution: cleanSteps,
    finalAnswer: cleanFinalAnswer,
    shortestTrick: cleanShortestTrick,
  };
}

function splitLinesToBullets(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseStructuredAnswerSections(answerText) {
  const text = String(answerText || '').trim();
  if (!text) {
    return {
      conceptExplanation: '',
      stepByStepSolution: [],
      finalAnswer: '',
      shortestTrick: '',
    };
  }

  const headingIndexes = [
    { key: 'concept', label: 'Concept Explanation' },
    { key: 'steps', label: 'Step-by-Step Solution' },
    { key: 'final', label: 'Final Answer' },
    { key: 'trick', label: 'Quick Trick or Shortcut Method' },
  ].map((item) => ({
    ...item,
    index: text.toLowerCase().indexOf(item.label.toLowerCase()),
  }));

  const valid = headingIndexes.filter((item) => item.index >= 0).sort((a, b) => a.index - b.index);

  if (valid.length < 2) {
    return {
      conceptExplanation: text,
      stepByStepSolution: [],
      finalAnswer: '',
      shortestTrick: '',
    };
  }

  const values = {
    concept: '',
    steps: '',
    final: '',
    trick: '',
  };

  valid.forEach((entry, idx) => {
    const next = valid[idx + 1];
    const start = entry.index + entry.label.length;
    const end = next ? next.index : text.length;
    values[entry.key] = text.slice(start, end).trim();
  });

  const cleanedSteps = splitLinesToBullets(values.steps).map((line) => line.replace(/^\d+[.)-]?\s*/, '').trim()).filter(Boolean);

  return {
    conceptExplanation: values.concept || text,
    stepByStepSolution: cleanedSteps,
    finalAnswer: values.final,
    shortestTrick: values.trick,
  };
}

function normalizePdfText(value) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022]/g, '-')
    .replace(/[\u00D7]/g, 'x')
    .replace(/[\u00F7]/g, '/')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/[\u221A]/g, 'sqrt')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStructuredDocumentPdfBuffer({ title, subtitle = '', sections = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 54, right: 54 } });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(21).fillColor('#1e3a8a').text(normalizePdfText(title || 'NET360 Export'), {
      align: 'left',
    });

    if (subtitle) {
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor('#475569').text(normalizePdfText(subtitle), { align: 'left' });
    }

    doc.moveDown(0.9);

    sections.forEach((section, sectionIndex) => {
      const heading = normalizePdfText(section?.heading || `Section ${sectionIndex + 1}`);
      const lines = Array.isArray(section?.lines) ? section.lines : [];

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(heading, { underline: false });
      doc.moveDown(0.25);

      if (!lines.length) {
        doc.font('Helvetica-Oblique').fontSize(11).fillColor('#64748b').text('No content available.');
      } else {
        lines.forEach((line) => {
          const cleanLine = normalizePdfText(line || '');
          doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(`- ${cleanLine}`, {
            paragraphGap: 6,
            indent: 12,
          });
        });
      }

      doc.moveDown(0.65);
    });

    doc.end();
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buildStructuredWordBuffer({ title, subtitle = '', sections = [] }) {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: String(title || 'NET360 Export'),
            heading: HeadingLevel.TITLE,
            spacing: { after: 160 },
          }),
          ...(subtitle
            ? [new Paragraph({
              children: [new TextRun({ text: String(subtitle), color: '475569', size: 20 })],
              spacing: { after: 260 },
              alignment: AlignmentType.LEFT,
            })]
            : []),
          ...sections.flatMap((section, sectionIndex) => {
            const heading = String(section?.heading || `Section ${sectionIndex + 1}`);
            const lines = Array.isArray(section?.lines) ? section.lines : [];

            const children = [
              new Paragraph({
                text: heading,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 180, after: 120 },
              }),
            ];

            if (!lines.length) {
              children.push(new Paragraph({
                children: [new TextRun({ text: 'No content available.', italics: true, color: '64748b' })],
                spacing: { after: 120 },
              }));
            } else {
              lines.forEach((line) => {
                children.push(new Paragraph({
                  text: String(line || ''),
                  bullet: { level: 0 },
                  spacing: { after: 80 },
                }));
              });
            }

            children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
            return children;
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}

function normalizeMentorExportFormat(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'pdf') return 'pdf';
  if (value === 'word' || value === 'doc' || value === 'docx') return 'word';
  return '';
}

function normalizeMentorExportTool(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'question-solve' || value === 'doubt-support' || value === 'study-planner') return value;
  return '';
}

function toSentenceList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return splitLinesToBullets(String(value || ''));
}

function buildMentorExportPayload({ tool, payload, user }) {
  const nowLabel = new Date().toLocaleString();
  const studentName = `${String(user?.firstName || '').trim()} ${String(user?.lastName || '').trim()}`.trim() || 'Student';

  if (tool === 'doubt-support') {
    const question = String(payload?.question || '').trim();
    const answer = String(payload?.answer || '').trim();
    const parsed = normalizeStructuredTutorPayload(payload?.structuredAnswer || {}, null)
      || parseStructuredAnswerSections(answer);

    return {
      title: 'NET360 Doubt Support Export',
      subtitle: `Student: ${studentName} | Generated: ${nowLabel}`,
      sections: [
        { heading: 'Asked Question', lines: [question || 'No question provided.'] },
        { heading: 'Concept Explanation', lines: toSentenceList(parsed.conceptExplanation) },
        { heading: 'Step-by-Step Solution', lines: toSentenceList(parsed.stepByStepSolution) },
        { heading: 'Final Answer', lines: toSentenceList(parsed.finalAnswer) },
        { heading: 'Quick Trick or Shortcut Method', lines: toSentenceList(parsed.shortestTrick) },
      ],
    };
  }

  if (tool === 'question-solve') {
    const questionText = String(payload?.questionText || '').trim();
    const subject = String(payload?.subject || '').trim();
    const topic = String(payload?.topic || '').trim();
    const result = payload?.result || {};
    const structured = normalizeStructuredTutorPayload(result, {
      conceptExplanation: String(result?.conceptExplanation || '').trim(),
      stepByStepSolution: toSentenceList(result?.stepByStepSolution),
      finalAnswer: String(result?.finalAnswer || '').trim(),
      shortestTrick: String(result?.shortestTrick || '').trim(),
    });

    return {
      title: 'NET360 Question Solver Export',
      subtitle: `Student: ${studentName} | Generated: ${nowLabel}`,
      sections: [
        { heading: 'Detected Context', lines: [
          `Subject: ${subject || 'General'}`,
          `Topic: ${topic || 'General'}`,
        ] },
        { heading: 'Question', lines: [questionText || 'No question text provided.'] },
        { heading: 'Concept Explanation', lines: toSentenceList(structured?.conceptExplanation || '') },
        { heading: 'Step-by-Step Solution', lines: toSentenceList(structured?.stepByStepSolution || []) },
        { heading: 'Final Answer', lines: toSentenceList(structured?.finalAnswer || '') },
        { heading: 'Shortest Trick', lines: toSentenceList(structured?.shortestTrick || '') },
      ],
    };
  }

  const plan = payload?.studyPlan || {};
  const weeklyTargets = Array.isArray(plan.weeklyTargets) ? plan.weeklyTargets : [];
  const dailySchedule = Array.isArray(plan.dailySchedule) ? plan.dailySchedule : [];
  const roadmap = Array.isArray(plan.roadmap) ? plan.roadmap : [];

  return {
    title: 'NET360 Study Planner Export',
    subtitle: `Student: ${studentName} | Generated: ${nowLabel}`,
    sections: [
      {
        heading: 'Plan Summary',
        lines: [
          `Target Date: ${String(plan.targetDate || 'Not set')}`,
          `Days Left: ${String(plan.daysLeft || 0)}`,
          `Preparation Level: ${String(plan.preparationLevel || 'Not set')}`,
          `Daily Study Hours: ${String(plan.dailyStudyHours || 0)}`,
          `Weak Subjects: ${Array.isArray(plan.weakSubjects) ? plan.weakSubjects.join(', ') : ''}`,
        ],
      },
      {
        heading: 'Weekly Targets',
        lines: weeklyTargets.map((item, idx) => `Week ${item?.week || idx + 1} (${String(item?.focus || 'Focus')}): ${String(item?.target || '')}`),
      },
      {
        heading: 'Daily Schedule',
        lines: dailySchedule.map((item) => `${String(item?.block || 'Block')}: ${String(item?.durationHours || 0)} hour(s) - ${String(item?.activity || '')}`),
      },
      {
        heading: 'Roadmap',
        lines: roadmap.map((item) => String(item || '').trim()).filter(Boolean),
      },
    ],
  };
}

async function bootstrapAdminAccounts() {
  if (!ADMIN_EMAILS.length) {
    console.log('Admin bootstrap skipped: ADMIN_EMAILS is empty.');
    return;
  }

  const now = new Date();
  const bootstrapPassword = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '').trim();

  // Always promote listed emails to admin if they already exist.
  const promoteResult = await UserModel.updateMany(
    { email: { $in: ADMIN_EMAILS } },
    { $set: { role: 'admin', updatedAt: now } },
  );

  let createdCount = 0;
  if (bootstrapPassword) {
    // If enabled, create missing admin accounts so first login can happen immediately.
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);
    for (const email of ADMIN_EMAILS) {
      const existing = await UserModel.findOne({ email }).lean();
      if (existing) continue;

      await UserModel.create({
        email,
        passwordHash,
        firstName: 'Admin',
        lastName: '',
        role: 'admin',
        preferences: defaultPreferences(),
        progress: defaultProgress(),
      });
      createdCount += 1;
    }
  }

  console.log(
    `Admin bootstrap complete: promoted ${promoteResult.modifiedCount || 0}, created ${createdCount}.`,
  );

  if (!bootstrapPassword) {
    console.log('Note: ADMIN_BOOTSTRAP_PASSWORD not set, so missing admin emails were not auto-created.');
  }
}

function userPublic(user) {
  const progress = { ...defaultProgress(), ...(user.progress || {}) };
  const subscription = normalizeSubscription(user);
  const plan = resolveSubscriptionPlan(subscription.planId);
  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone || '',
    city: user.city || '',
    targetProgram: user.targetProgram || '',
    testSeries: user.testSeries || '',
    sscPercentage: user.sscPercentage || '',
    hsscPercentage: user.hsscPercentage || '',
    testDate: user.testDate || '',
    role: user.role || 'student',
    preferences: { ...defaultPreferences(), ...(user.preferences || {}) },
    progress,
    subscription: {
      ...subscription,
      isActive: isSubscriptionActive(subscription),
      dailyAiLimit: plan?.dailyAiLimit || 0,
      planName: plan?.name || '',
    },
    test_history: progress.completedTests || [],
    scores: progress.scores || [],
    study_hours: progress.studyHours || 0,
    weak_topics: progress.weakTopics || [],
  };
}

function serializeSession(session) {
  return {
    id: String(session._id),
    userId: String(session.userId),
    subject: session.subject,
    difficulty: session.difficulty,
    topic: session.topic,
    mode: session.mode,
    questionCount: session.questionCount,
    durationMinutes: session.durationMinutes,
    startedAt: new Date(session.startedAt).toISOString(),
    finishedAt: session.finishedAt ? new Date(session.finishedAt).toISOString() : null,
    cancelledAt: session.cancelledAt ? new Date(session.cancelledAt).toISOString() : null,
    cancelReason: String(session.cancelReason || ''),
    cancelTrigger: String(session.cancelTrigger || ''),
    questions: session.questions || [],
  };
}

function serializeAttempt(attempt) {
  return {
    id: String(attempt._id),
    sessionId: String(attempt.sessionId),
    userId: String(attempt.userId),
    subject: attempt.subject,
    topic: attempt.topic,
    difficulty: attempt.difficulty,
    mode: attempt.mode,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    correctAnswers: attempt.correctAnswers,
    wrongAnswers: attempt.wrongAnswers,
    unanswered: attempt.unanswered,
    submittedAnswers: attempt.submittedAnswers,
    durationMinutes: attempt.durationMinutes,
    attemptedAt: new Date(attempt.attemptedAt).toISOString(),
    submittedAt: new Date(attempt.submittedAt).toISOString(),
    metadata: attempt.metadata || {},
  };
}

function serializeMcq(item) {
  const chapter = String(item.chapter || '').trim();
  const section = String(item.section || '').trim() || String(item.topic || '').trim();
  const topic = String(item.topic || '').trim() || section || chapter || 'General';

  const normalizedQuestionImage = item.questionImage
    ? {
      name: String(item.questionImage.name || '').trim(),
      mimeType: String(item.questionImage.mimeType || '').trim().toLowerCase(),
      size: Number(item.questionImage.size || 0),
      dataUrl: String(item.questionImage.dataUrl || '').trim(),
    }
    : normalizeLegacyImageUrlAsFile(item.questionImageUrl, 'question-image');

  const mediaOptions = Array.isArray(item.optionMedia) ? item.optionMedia : [];
  const textOptions = Array.isArray(item.options) ? item.options : [];
  const optionCount = Math.max(mediaOptions.length, textOptions.length);
  const normalizedOptionMedia = Array.from({ length: optionCount }, (_unused, index) => {
    const media = mediaOptions[index] && typeof mediaOptions[index] === 'object' ? mediaOptions[index] : {};
    const text = String(media.text || textOptions[index] || '').trim();
    const image = media.image
      ? {
        name: String(media.image.name || '').trim(),
        mimeType: String(media.image.mimeType || '').trim().toLowerCase(),
        size: Number(media.image.size || 0),
        dataUrl: String(media.image.dataUrl || '').trim(),
      }
      : null;
    if (!text && !image) return null;
    return {
      key: String.fromCharCode(65 + index),
      text,
      image,
    };
  }).filter(Boolean);

  const resolvedOptionMedia = normalizedOptionMedia.length
    ? normalizedOptionMedia
    : textOptions.map((text, index) => ({
      key: String.fromCharCode(65 + index),
      text: String(text || '').trim(),
      image: null,
    }));

  const resolvedOptions = resolvedOptionMedia.map((item) => item.text || `[${item.key}]`);

  const explanationText = String(item.explanationText || item.tip || '').trim();
  const explanationImage = item.explanationImage
    ? {
      name: String(item.explanationImage.name || '').trim(),
      mimeType: String(item.explanationImage.mimeType || '').trim().toLowerCase(),
      size: Number(item.explanationImage.size || 0),
      dataUrl: String(item.explanationImage.dataUrl || '').trim(),
    }
    : null;

  const shortTrickText = String(item.shortTrickText || '').trim();
  const shortTrickImage = item.shortTrickImage
    ? {
      name: String(item.shortTrickImage.name || '').trim(),
      mimeType: String(item.shortTrickImage.mimeType || '').trim().toLowerCase(),
      size: Number(item.shortTrickImage.size || 0),
      dataUrl: String(item.shortTrickImage.dataUrl || '').trim(),
    }
    : null;

  const rawAnswer = String(item.answer || '').trim();
  const loweredAnswer = rawAnswer.toLowerCase();
  let answerKey = '';
  resolvedOptionMedia.forEach((option) => {
    if (!answerKey && option.text && option.text.trim().toLowerCase() === loweredAnswer) {
      answerKey = option.key;
    }
  });
  if (!answerKey) {
    const direct = rawAnswer.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
    if (direct) {
      const token = direct[1];
      const idx = /^\d+$/.test(token) ? Number(token) - 1 : token.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < resolvedOptionMedia.length) {
        answerKey = resolvedOptionMedia[idx].key;
      }
    }
  }

  return {
    id: String(item._id),
    subject: item.subject,
    part: String(item.part || '').trim(),
    chapter,
    section,
    topic,
    question: item.question,
    questionImageUrl: String(item.questionImageUrl || '').trim(),
    questionImage: normalizedQuestionImage,
    options: resolvedOptions,
    optionMedia: resolvedOptionMedia,
    answer: item.answer,
    answerKey,
    tip: item.tip,
    explanationText,
    explanationImage,
    shortTrickText,
    shortTrickImage,
    difficulty: item.difficulty,
  };
}

function serializePracticeBoardQuestion(item) {
  const legacyQuestionUrl = String(item.questionImageUrl || '').trim();
  const legacySolutionUrl = String(item.solutionImageUrl || '').trim();
  const normalizedQuestionFile = item.questionFile
    ? {
      name: String(item.questionFile.name || '').trim(),
      mimeType: String(item.questionFile.mimeType || '').trim().toLowerCase(),
      size: Number(item.questionFile.size || 0),
      dataUrl: String(item.questionFile.dataUrl || '').trim(),
    }
    : (legacyQuestionUrl
      ? {
        name: 'question-image',
        mimeType: 'image/*',
        size: 0,
        dataUrl: legacyQuestionUrl,
      }
      : null);

  const normalizedSolutionFile = item.solutionFile
    ? {
      name: String(item.solutionFile.name || '').trim(),
      mimeType: String(item.solutionFile.mimeType || '').trim().toLowerCase(),
      size: Number(item.solutionFile.size || 0),
      dataUrl: String(item.solutionFile.dataUrl || '').trim(),
    }
    : (legacySolutionUrl
      ? {
        name: 'solution-image',
        mimeType: 'image/*',
        size: 0,
        dataUrl: legacySolutionUrl,
      }
      : null);

  return {
    id: String(item._id),
    subject: String(item.subject || '').toLowerCase(),
    difficulty: String(item.difficulty || 'Medium'),
    questionText: String(item.questionText || '').trim(),
    questionFile: normalizedQuestionFile,
    solutionText: String(item.solutionText || '').trim(),
    solutionFile: normalizedSolutionFile,
  };
}

function makeCommunityUsername(user) {
  const first = String(user?.firstName || '').trim();
  const last = String(user?.lastName || '').trim();
  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;
  const email = String(user?.email || '').trim().toLowerCase();
  if (email.includes('@')) return email.split('@')[0];
  return `student-${String(user?._id || '').slice(-6)}`;
}

const COMMUNITY_ROOM_DEFINITIONS = [
  { id: 'mathematics', title: 'Math Problem Solving', subject: 'mathematics' },
  { id: 'physics', title: 'Physics Concepts', subject: 'physics' },
  { id: 'chemistry', title: 'Chemistry Discussion', subject: 'chemistry' },
  { id: 'biology', title: 'Biology Revision Circle', subject: 'biology' },
  { id: 'english', title: 'English NET Boosters', subject: 'english' },
  { id: 'intelligence', title: 'Intelligence Practice Hub', subject: 'intelligence' },
  { id: 'quantitative-mathematics', title: 'Quantitative Mathematics', subject: 'quantitative mathematics' },
  { id: 'design-aptitude', title: 'Design Aptitude Lab', subject: 'design aptitude' },
  { id: 'past-mcqs', title: 'NET Past MCQs Discussion', subject: 'mixed' },
  { id: 'quick-doubt', title: 'Quick Doubt Help', subject: 'mixed' },
  { id: 'study-motivation', title: 'Study Motivation', subject: 'mixed' },
];

function normalizeSubjectList(values, limit = 8) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeCommunityNetType(value) {
  const raw = String(value || '').trim().toLowerCase();
  const allowed = new Set([
    'net-engineering',
    'net-applied-sciences',
    'net-business-social-sciences',
    'net-architecture',
    'net-natural-sciences',
  ]);
  return allowed.has(raw) ? raw : 'net-engineering';
}

function normalizePreparationLevel(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['beginner', 'intermediate', 'advanced'].includes(raw) ? raw : 'intermediate';
}

function normalizeStudyTimePreference(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['morning', 'evening', 'night', 'flexible'].includes(raw) ? raw : 'flexible';
}

function levelRank(level) {
  if (level === 'advanced') return 3;
  if (level === 'intermediate') return 2;
  return 1;
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

async function getOrCreateCommunityProfile(user) {
  const existing = await CommunityProfileModel.findOne({ userId: user._id });
  if (existing) return existing;

  const base = normalizeUsername(makeCommunityUsername(user)) || `student-${String(user._id).slice(-6)}`;
  let candidate = base;
  let suffix = 1;
  while (await CommunityProfileModel.findOne({ username: candidate })) {
    suffix += 1;
    candidate = `${base}-${suffix}`.slice(0, 40);
  }

  return CommunityProfileModel.create({
    userId: user._id,
    username: candidate,
    shareProfilePicture: false,
    profilePictureUrl: '',
    favoriteSubjects: [],
    targetNetType: 'net-engineering',
    subjectsNeedHelp: [],
    preparationLevel: 'intermediate',
    studyTimePreference: 'flexible',
    testScoreRange: { min: 0, max: 200 },
    bio: '',
  });
}

function connectionKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':');
}

function normalizeChallengeMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['subject-wise', 'mock', 'adaptive', 'custom'].includes(raw)) return raw;
  return '';
}

function normalizeChallengeType(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'live' ? 'live' : 'async';
}

function normalizeChallengeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'easy') return 'Easy';
  if (raw === 'hard') return 'Hard';
  return 'Medium';
}

function normalizeChallengeSubject(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['mathematics', 'physics', 'english', 'biology', 'chemistry'].includes(raw)) return raw;
  return '';
}

function defaultQuizStats() {
  return {
    totalWins: 0,
    totalMatchesPlayed: 0,
    totalChallengesSent: 0,
    totalChallengesAccepted: 0,
    subjectPerformance: [],
  };
}

function ensureQuizStats(profile) {
  const current = profile?.quizStats || {};
  const normalizedRows = Array.isArray(current.subjectPerformance)
    ? current.subjectPerformance.map((row) => ({
      subject: String(row?.subject || '').trim().toLowerCase(),
      matchesPlayed: Number(row?.matchesPlayed || 0),
      wins: Number(row?.wins || 0),
      averageAccuracy: Number(row?.averageAccuracy || 0),
    })).filter((row) => row.subject)
    : [];

  return {
    ...defaultQuizStats(),
    ...current,
    totalWins: Number(current.totalWins || 0),
    totalMatchesPlayed: Number(current.totalMatchesPlayed || 0),
    totalChallengesSent: Number(current.totalChallengesSent || 0),
    totalChallengesAccepted: Number(current.totalChallengesAccepted || 0),
    subjectPerformance: normalizedRows,
  };
}

function formatQuizStatsForPublic(profile) {
  const stats = ensureQuizStats(profile);
  const totalMatchesPlayed = Number(stats.totalMatchesPlayed || 0);
  const totalWins = Number(stats.totalWins || 0);
  const winRate = totalMatchesPlayed > 0 ? Number(((totalWins / totalMatchesPlayed) * 100).toFixed(1)) : 0;
  return {
    totalWins,
    totalMatchesPlayed,
    winRate,
    totalChallengesSent: Number(stats.totalChallengesSent || 0),
    totalChallengesAccepted: Number(stats.totalChallengesAccepted || 0),
    subjectPerformance: stats.subjectPerformance,
  };
}

async function generateQuizChallengeQuestions({ mode, subject, topic, difficulty, questionCount, challengerUser, opponentUser }) {
  const safeCount = clamp(Number(questionCount) || 15, 5, 40);
  const normalizedSubject = normalizeChallengeSubject(subject);
  const normalizedDifficulty = normalizeChallengeDifficulty(difficulty);
  const normalizedTopic = String(topic || '').trim();

  const allowedSubjects = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
  let pool = [];

  if (mode === 'subject-wise') {
    if (!normalizedSubject) {
      throw new Error('Subject-wise challenge requires a valid subject.');
    }
    pool = await MCQModel.find({ subject: normalizedSubject }).select(MCQ_SELECT).limit(500).lean();
  } else if (mode === 'custom') {
    const filter = {};
    if (normalizedSubject) filter.subject = normalizedSubject;
    if (normalizedTopic) filter.topic = containsRegex(normalizedTopic, 80);
    if (normalizedDifficulty) filter.difficulty = normalizedDifficulty;
    pool = await MCQModel.find(filter).select(MCQ_SELECT).limit(500).lean();
  } else if (mode === 'adaptive') {
    const weakTopics = Array.from(new Set([
      ...(challengerUser?.progress?.weakTopics || []).map((item) => String(item || '').toLowerCase()),
      ...(opponentUser?.progress?.weakTopics || []).map((item) => String(item || '').toLowerCase()),
    ])).filter(Boolean);

    const basePool = await MCQModel.find({ subject: { $in: allowedSubjects } }).select(MCQ_SELECT).limit(900).lean();
    const filtered = weakTopics.length
      ? basePool.filter((item) => {
        const itemTopic = String(item.topic || '').toLowerCase();
        const itemSubject = String(item.subject || '').toLowerCase();
        return weakTopics.some((weak) => itemTopic.includes(weak) || itemSubject.includes(weak));
      })
      : [];
    pool = filtered.length >= safeCount ? filtered : basePool;
  } else {
    pool = await MCQModel.find({ subject: { $in: allowedSubjects } }).select(MCQ_SELECT).limit(900).lean();
  }

  if (!pool.length) {
    throw new Error('No quiz questions available for this challenge configuration.');
  }

  const selected = shuffle(pool).slice(0, Math.min(safeCount, pool.length));
  if (!selected.length) {
    throw new Error('Could not generate challenge questions.');
  }

  return selected.map((item) => ({
    questionId: String(item._id),
    subject: String(item.subject || '').toLowerCase(),
    topic: String(item.topic || '').trim(),
    question: String(item.question || '').trim(),
    options: Array.isArray(item.options) ? item.options.map((option) => String(option || '').trim()) : [],
    difficulty: String(item.difficulty || 'Medium'),
    correctAnswer: String(item.answer || '').trim(),
  }));
}

function serializeQuizChallenge(challenge, currentUserId) {
  const meId = String(currentUserId || '');
  const isChallenger = String(challenge.challengerUserId) === meId;
  const myResult = isChallenger ? challenge.challengerResult : challenge.opponentResult;
  const opponentResult = isChallenger ? challenge.opponentResult : challenge.challengerResult;
  const myLiveProgress = isChallenger ? challenge.challengerLiveProgress : challenge.opponentLiveProgress;
  const opponentLiveProgress = isChallenger ? challenge.opponentLiveProgress : challenge.challengerLiveProgress;
  const revealAnswers = String(challenge.status) === 'completed';
  const questionSetHash = hashToken((challenge.questions || []).map((item) => String(item.questionId || '')).join('|'));

  return {
    id: String(challenge._id),
    connectionId: challenge.connectionId ? String(challenge.connectionId) : '',
    challengerUserId: String(challenge.challengerUserId),
    opponentUserId: String(challenge.opponentUserId),
    mode: String(challenge.mode || ''),
    challengeType: String(challenge.challengeType || 'async'),
    subject: String(challenge.subject || ''),
    topic: String(challenge.topic || ''),
    difficulty: String(challenge.difficulty || 'Medium'),
    questionCount: Number(challenge.questionCount || 0),
    questionSetHash,
    durationSeconds: Number(challenge.durationSeconds || 0),
    status: String(challenge.status || 'pending'),
    invitedAt: challenge.invitedAt ? new Date(challenge.invitedAt).toISOString() : null,
    acceptedAt: challenge.acceptedAt ? new Date(challenge.acceptedAt).toISOString() : null,
    acceptedDeadlineAt: challenge.acceptedDeadlineAt ? new Date(challenge.acceptedDeadlineAt).toISOString() : null,
    startedAt: challenge.startedAt ? new Date(challenge.startedAt).toISOString() : null,
    endedAt: challenge.endedAt ? new Date(challenge.endedAt).toISOString() : null,
    winnerUserId: challenge.winnerUserId ? String(challenge.winnerUserId) : '',
    isChallenger,
    myResult: {
      submitted: Boolean(myResult?.submitted),
      completedAt: myResult?.completedAt ? new Date(myResult.completedAt).toISOString() : null,
      elapsedSeconds: Number(myResult?.elapsedSeconds || 0),
      answers: Array.isArray(myResult?.answers)
        ? myResult.answers.map((row) => ({
          questionId: String(row?.questionId || ''),
          selectedOption: String(row?.selectedOption || ''),
        }))
        : [],
      correctCount: Number(myResult?.correctCount || 0),
      wrongCount: Number(myResult?.wrongCount || 0),
      unansweredCount: Number(myResult?.unansweredCount || 0),
      accuracyScore: Number(myResult?.accuracyScore || 0),
      speedScore: Number(myResult?.speedScore || 0),
      totalScore: Number(myResult?.totalScore || 0),
    },
    opponentResult: {
      submitted: Boolean(opponentResult?.submitted),
      completedAt: opponentResult?.completedAt ? new Date(opponentResult.completedAt).toISOString() : null,
      elapsedSeconds: Number(opponentResult?.elapsedSeconds || 0),
      correctCount: Number(opponentResult?.correctCount || 0),
      wrongCount: Number(opponentResult?.wrongCount || 0),
      unansweredCount: Number(opponentResult?.unansweredCount || 0),
      accuracyScore: Number(opponentResult?.accuracyScore || 0),
      speedScore: Number(opponentResult?.speedScore || 0),
      totalScore: Number(opponentResult?.totalScore || 0),
    },
    myLiveProgress: {
      answeredCount: Number(myLiveProgress?.answeredCount || 0),
      correctCount: Number(myLiveProgress?.correctCount || 0),
      elapsedSeconds: Number(myLiveProgress?.elapsedSeconds || 0),
      updatedAt: myLiveProgress?.updatedAt ? new Date(myLiveProgress.updatedAt).toISOString() : null,
    },
    opponentLiveProgress: {
      answeredCount: Number(opponentLiveProgress?.answeredCount || 0),
      correctCount: Number(opponentLiveProgress?.correctCount || 0),
      elapsedSeconds: Number(opponentLiveProgress?.elapsedSeconds || 0),
      updatedAt: opponentLiveProgress?.updatedAt ? new Date(opponentLiveProgress.updatedAt).toISOString() : null,
    },
    questions: Array.isArray(challenge.questions)
      ? challenge.questions.map((item) => ({
        questionId: String(item.questionId || ''),
        subject: String(item.subject || ''),
        topic: String(item.topic || ''),
        question: String(item.question || ''),
        options: Array.isArray(item.options) ? item.options.map((option) => String(option || '')) : [],
        difficulty: String(item.difficulty || 'Medium'),
        correctAnswer: revealAnswers ? String(item.correctAnswer || '') : '',
      }))
      : [],
  };
}

function scoreQuizChallengeSubmission(challenge, answers, elapsedSeconds) {
  const questionMap = new Map(
    (challenge.questions || []).map((item) => [String(item.questionId || ''), String(item.correctAnswer || '').trim().toLowerCase()]),
  );

  const answerMap = new Map();
  (Array.isArray(answers) ? answers : []).forEach((row) => {
    const qid = String(row?.questionId || '').trim();
    if (!qid || !questionMap.has(qid)) return;
    answerMap.set(qid, String(row?.selectedOption || '').trim());
  });

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  Array.from(questionMap.entries()).forEach(([qid, correctAnswer]) => {
    const selected = String(answerMap.get(qid) || '').trim();
    if (!selected) {
      unansweredCount += 1;
      return;
    }

    if (selected.toLowerCase() === correctAnswer) {
      correctCount += 1;
    } else {
      wrongCount += 1;
    }
  });

  const totalQuestions = Math.max(1, Number(challenge.questionCount || questionMap.size || 1));
  const safeElapsed = clamp(Number(elapsedSeconds) || 0, 0, Number(challenge.durationSeconds || 3600));
  const accuracyScore = Number(((correctCount / totalQuestions) * 100).toFixed(2));
  const speedRatio = safeElapsed > 0 ? (safeElapsed / Math.max(1, Number(challenge.durationSeconds || 3600))) : 0;
  const speedScore = Number(Math.max(0, (100 - (speedRatio * 100))).toFixed(2));
  const totalScore = Number(((accuracyScore * 0.85) + (speedScore * 0.15)).toFixed(2));

  return {
    safeElapsed,
    correctCount,
    wrongCount,
    unansweredCount,
    accuracyScore,
    speedScore,
    totalScore,
    answerRows: Array.from(answerMap.entries()).map(([questionId, selectedOption]) => ({ questionId, selectedOption })),
  };
}

function computeLockedLiveProgress(challenge, answers, elapsedSeconds) {
  const questionMap = new Map(
    (challenge.questions || []).map((item) => [String(item.questionId || ''), String(item.correctAnswer || '').trim().toLowerCase()]),
  );

  const answerMap = new Map();
  (Array.isArray(answers) ? answers : []).forEach((row) => {
    const qid = String(row?.questionId || '').trim();
    if (!qid || !questionMap.has(qid)) return;
    answerMap.set(qid, String(row?.selectedOption || '').trim());
  });

  let correctCount = 0;
  answerMap.forEach((selected, qid) => {
    const correctAnswer = questionMap.get(qid) || '';
    if (String(selected || '').trim().toLowerCase() === correctAnswer) {
      correctCount += 1;
    }
  });

  return {
    answeredCount: answerMap.size,
    correctCount,
    elapsedSeconds: clamp(Number(elapsedSeconds) || 0, 0, Number(challenge.durationSeconds || 0)),
  };
}

async function applyQuizStatsToProfiles(challenge) {
  const subjectKey = normalizeChallengeSubject(challenge.subject) || 'mixed';
  const winnerId = challenge.winnerUserId ? String(challenge.winnerUserId) : '';
  const entries = [
    { userId: String(challenge.challengerUserId), result: challenge.challengerResult },
    { userId: String(challenge.opponentUserId), result: challenge.opponentResult },
  ];

  for (const entry of entries) {
    const user = await UserModel.findById(entry.userId).lean();
    if (!user) continue;
    const profile = await getOrCreateCommunityProfile(user);
    const stats = ensureQuizStats(profile);

    stats.totalMatchesPlayed += 1;
    if (winnerId && winnerId === entry.userId) {
      stats.totalWins += 1;
    }

    const rows = Array.isArray(stats.subjectPerformance) ? stats.subjectPerformance : [];
    const existing = rows.find((row) => String(row.subject || '').toLowerCase() === subjectKey);
    if (!existing) {
      rows.push({
        subject: subjectKey,
        matchesPlayed: 1,
        wins: winnerId && winnerId === entry.userId ? 1 : 0,
        averageAccuracy: Number(entry.result?.accuracyScore || 0),
      });
    } else {
      const nextMatches = Number(existing.matchesPlayed || 0) + 1;
      const currentAverage = Number(existing.averageAccuracy || 0);
      existing.averageAccuracy = Number((((currentAverage * Number(existing.matchesPlayed || 0)) + Number(entry.result?.accuracyScore || 0)) / nextMatches).toFixed(2));
      existing.matchesPlayed = nextMatches;
      if (winnerId && winnerId === entry.userId) {
        existing.wins = Number(existing.wins || 0) + 1;
      }
    }

    profile.quizStats = {
      ...stats,
      subjectPerformance: rows,
    };
    await profile.save();
  }
}

async function getCommunityRestriction(userId) {
  const block = await CommunityBlockModel.findOne({ userId }).lean();
  if (!block) {
    return {
      blocked: false,
      muted: false,
      warningCount: 0,
      reason: '',
      action: 'none',
    };
  }

  const now = Date.now();
  const bannedUntil = block.bannedUntil ? new Date(block.bannedUntil).getTime() : 0;
  const mutedUntil = block.mutedUntil ? new Date(block.mutedUntil).getTime() : 0;
  const blocked = Boolean(block.blocked && (!bannedUntil || bannedUntil > now));
  const muted = Boolean(mutedUntil && mutedUntil > now);

  return {
    blocked,
    muted,
    warningCount: Number(block.warningCount || 0),
    reason: String(block.reason || 'Community access restricted due to moderation action.').trim(),
    action: String(block.lastAction || 'none'),
    mutedUntil: block.mutedUntil ? new Date(block.mutedUntil).toISOString() : null,
    bannedUntil: block.bannedUntil ? new Date(block.bannedUntil).toISOString() : null,
  };
}

async function ensureCommunityAccess(userId) {
  const restriction = await getCommunityRestriction(userId);
  if (!restriction.blocked) return null;
  return {
    blocked: true,
    reason: restriction.reason,
    code: 'COMMUNITY_BANNED',
  };
}

async function ensureCommunityWritable(userId) {
  const restriction = await getCommunityRestriction(userId);
  if (restriction.blocked) {
    return {
      blocked: true,
      reason: restriction.reason,
      code: 'COMMUNITY_BANNED',
      restriction,
    };
  }
  if (restriction.muted) {
    return {
      blocked: true,
      reason: `You are temporarily muted in community until ${restriction.mutedUntil}.`,
      code: 'COMMUNITY_MUTED',
      restriction,
    };
  }
  return null;
}

async function applyCommunityViolation(userId, reason, sourceReportId = '') {
  const current = await CommunityBlockModel.findOne({ userId });
  const warningCount = Number(current?.warningCount || 0) + 1;
  const next = {
    warningCount,
    reason: String(reason || 'Community policy violation detected.').trim(),
    sourceReportId: String(sourceReportId || current?.sourceReportId || ''),
  };

  if (warningCount >= 5) {
    next.blocked = true;
    next.lastAction = 'ban';
    next.bannedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    next.blockedAt = new Date();
  } else if (warningCount >= 3) {
    next.blocked = false;
    next.lastAction = 'mute';
    next.mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else {
    next.blocked = false;
    next.lastAction = 'warning';
  }

  await CommunityBlockModel.findOneAndUpdate(
    { userId },
    {
      $set: next,
      $setOnInsert: { blockedAt: new Date() },
    },
    { upsert: true, new: true },
  );

  return warningCount;
}

function serializeCommunityUser(params) {
  const profile = params?.profile || {};
  const user = params?.user || {};
  const includePrivatePicture = Boolean(params?.includePrivatePicture);
  const showPicture = Boolean(profile.profilePictureUrl && (includePrivatePicture || profile.shareProfilePicture));
  return {
    id: String(user._id || ''),
    userId: String(user._id || ''),
    firstName: String(user.firstName || ''),
    lastName: String(user.lastName || ''),
    city: String(user.city || ''),
    username: String(profile.username || makeCommunityUsername(user)),
    profilePictureUrl: showPicture ? String(profile.profilePictureUrl || '') : '',
    shareProfilePicture: Boolean(profile.shareProfilePicture),
    targetProgram: String(user.targetProgram || ''),
    score: Number(user.progress?.averageScore || 0),
    testsCompleted: Number(user.progress?.testsCompleted || 0),
    questionsSolved: Number(user.progress?.questionsSolved || 0),
    targetNetType: String(profile.targetNetType || 'net-engineering'),
    subjectsNeedHelp: normalizeSubjectList(profile.subjectsNeedHelp || []),
    preparationLevel: normalizePreparationLevel(profile.preparationLevel),
    studyTimePreference: normalizeStudyTimePreference(profile.studyTimePreference),
    testScoreRange: {
      min: Number(profile.testScoreRange?.min || 0),
      max: Number(profile.testScoreRange?.max || 200),
    },
    favoriteSubjects: normalizeSubjectList(profile.favoriteSubjects || []),
    bio: String(profile.bio || ''),
  };
}

function moderateCommunityConversation(messages) {
  const harmfulPattern = /(abuse|idiot|stupid|hate|kill|threat|harass|scam|fraud|porn|adult|nude|hack|malware|terror|fuck|bitch|slur)/i;
  const spamPattern = /(buy now|click here|free money|join now|whatsapp group|crypto signal)/i;

  const offenderScore = new Map();
  const reasons = [];

  for (const message of messages || []) {
    const sender = String(message.senderUserId || '');
    const text = String(message.text || '').trim();
    if (!sender || !text) continue;

    let score = offenderScore.get(sender) || 0;
    if (harmfulPattern.test(text)) {
      score += 55;
      reasons.push('Detected abusive or harmful wording in chat.');
    }
    if (spamPattern.test(text)) {
      score += 45;
      reasons.push('Detected spam-like or malicious promotional patterns.');
    }
    if (text.length > 0 && text.length < 2) {
      score += 5;
    }
    offenderScore.set(sender, score);
  }

  let violatorUserId = '';
  let topScore = 0;
  offenderScore.forEach((score, sender) => {
    if (score > topScore) {
      topScore = score;
      violatorUserId = sender;
    }
  });

  return {
    result: topScore >= 50 ? 'harmful' : 'clean',
    score: Math.min(100, topScore),
    reasons: Array.from(new Set(reasons)),
    violatorUserId,
  };
}

function getPeriodBounds(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === 'monthly') {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setDate(start.getDate() - 7);
  }
  return { start, end: now };
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function longestRecentStreak(dates) {
  const unique = Array.from(new Set((dates || []).map((item) => dayKey(item)))).sort();
  if (!unique.length) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i += 1) {
    const prev = new Date(`${unique[i - 1]}T00:00:00Z`).getTime();
    const next = new Date(`${unique[i]}T00:00:00Z`).getTime();
    if ((next - prev) === 24 * 60 * 60 * 1000) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function serializeQuestionSubmission(item) {
  const normalizedStatus = String(item.status || 'pending').toLowerCase();
  return {
    id: String(item._id),
    subject: String(item.subject || '').trim(),
    questionText: String(item.questionText || '').trim(),
    questionDescription: String(item.questionDescription || '').trim(),
    questionSource: String(item.questionSource || '').trim(),
    submissionReason: String(item.submissionReason || '').trim(),
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map((file) => ({
        name: String(file.name || '').trim(),
        mimeType: String(file.mimeType || '').trim(),
        size: Number(file.size || 0),
        dataUrl: String(file.dataUrl || '').trim(),
      }))
      : [],
    status: normalizedStatus,
    queuedForBank: Boolean(item.queuedForBank),
    submittedByName: String(item.submittedByName || '').trim(),
    submittedByEmail: String(item.submittedByEmail || '').trim(),
    submittedByUserId: String(item.submittedByUserId || '').trim(),
    submittedByClientId: String(item.submittedByClientId || '').trim(),
    actorKey: String(item.actorKey || '').trim(),
    moderation: {
      result: String(item.moderation?.result || 'approved').trim(),
      reasons: Array.isArray(item.moderation?.reasons) ? item.moderation.reasons.map((reason) => String(reason || '').trim()).filter(Boolean) : [],
      score: Number(item.moderation?.score || 0),
      blockedActor: Boolean(item.moderation?.blockedActor),
      reviewedAt: item.moderation?.reviewedAt ? new Date(item.moderation.reviewedAt).toISOString() : null,
    },
    reviewNotes: String(item.reviewNotes || '').trim(),
    reviewedByEmail: String(item.reviewedByEmail || '').trim(),
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      if (!Number.isFinite(value)) return '';
      return String.fromCharCode(value);
    });
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function sanitizeUpdateText(text, maxLen = 220) {
  return String(text || '')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\b\w+>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizeNustStatus(raw, fallback = 'info') {
  const text = String(raw || '').toLowerCase();
  if (text.includes('open soon') || text.includes('open now') || text.includes('open')) return 'open';
  if (text.includes('closed')) return 'closed';
  if (text.includes('completed') || text.includes('result declared') || text.includes('result announced')) return 'completed';
  if (text.includes('upcoming') || text.includes('will start') || text.includes('starting')) return 'upcoming';
  return fallback;
}

function parseNustImportantDates(html) {
  const sourceText = stripHtml(html).replace(/\s+/g, ' ').trim();
  const items = [];

  for (let series = 1; series <= 4; series += 1) {
    const nextBoundary = series < 4
      ? `NET\\s*Series\\s*${series + 1}`
      : '(?:ACT\\s*\\/\\s*SAT|Important\\s*Notice|Result\\s*NET|$)';
    const blockRegex = new RegExp(`NET\\s*Series\\s*${series}([\\s\\S]{0,700}?)(?=${nextBoundary})`, 'i');
    const blockMatch = sourceText.match(blockRegex);
    if (!blockMatch) continue;

    const block = String(blockMatch[0] || '').trim();
    const registrationMatch = block.match(/(?:Registration|Online Registration|Applications?)\\s*(?:[:\\-]|for)?\\s*([^.|]{8,150})/i);
    const testDateMatch = block.match(/(?:Test\\s*Date|Test)\\s*(?:[:\\-])?\\s*([^.|]{5,110})/i);
    const lastDateMatch = block.match(/Last\\s*Date\\s*[:\\-]\\s*([^.|]{5,90})/i);

    let registration = registrationMatch
      ? `Online Registration: ${String(registrationMatch[1] || '').trim()}`
      : '';
    if (!registration && lastDateMatch) {
      registration = `Online Registration: Last Date ${String(lastDateMatch[1] || '').trim()}`;
    }

    const testDate = testDateMatch
      ? `Test Schedule: ${String(testDateMatch[1] || '').trim()}`
      : 'Test Schedule: To be announced';

    items.push({
      key: `series-${series}`,
      title: `NET Series ${series}`,
      registration: registration || 'Online Registration: To be announced',
      testDate,
      status: normalizeNustStatus(block, series === 1 ? 'completed' : 'upcoming'),
    });
  }

  return items;
}

function sliceNoticeBlock(html) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const start = lower.indexOf('important notice');
  if (start < 0) return source;

  const ends = ['salients of net', 'nust entry test', 'act/sat basis', 'related links', '</footer>']
    .map((needle) => lower.indexOf(needle, start + 5))
    .filter((index) => index > start);
  const end = ends.length ? Math.min(...ends) : Math.min(source.length, start + 14000);
  return source.slice(start, end);
}

const NUST_NOTICE_BLOCKLIST_PATTERNS = [
  /mathematics\s*course/i,
  /pre[\s-]*medical/i,
  /8\s*weeks?\s*(duration\s*)?course/i,
];

function shouldIgnoreNustNoticeContent(value) {
  const text = String(value || '').toLowerCase();
  return NUST_NOTICE_BLOCKLIST_PATTERNS.some((pattern) => pattern.test(text));
}

function filterNustNotices(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const title = String(item?.title || '');
    const subtitle = String(item?.subtitle || '');
    return !shouldIgnoreNustNoticeContent(`${title} ${subtitle}`);
  });
}

function parseNustNotices(html) {
  const block = sliceNoticeBlock(html);
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const ignoredTitles = new Set([
    'home',
    'contact us',
    'nust home',
    'brochure',
    'sample test',
    'forgot password?',
    'new registration for net',
  ]);

  const items = [];
  const seen = new Set();

  for (const match of block.matchAll(anchorRegex)) {
    const title = sanitizeUpdateText(stripHtml(match[2] || ''), 180);
    if (!title || title.length < 6) continue;
    if (ignoredTitles.has(title.toLowerCase())) continue;

    const key = title.toLowerCase();
    if (seen.has(key)) continue;

    // Capture nearby sentence fragments for subtitle context.
    const index = Number(match.index || 0);
    const nearbyRaw = block.slice(Math.max(0, index - 180), Math.min(block.length, index + 360));
    const nearbyText = sanitizeUpdateText(stripHtml(nearbyRaw).replace(title, ''), 220);

    const subtitle = nearbyText.slice(0, 180)
      || 'Important admission notice extracted from latest NUST undergraduate updates.';

    if (shouldIgnoreNustNoticeContent(`${title} ${subtitle}`)) {
      continue;
    }

    const combined = `${title} ${subtitle}`.toLowerCase();
    let category = 'notice';
    if (combined.includes('result')) category = 'result';
    else if (combined.includes('act/sat') || combined.includes('act sat') || combined.includes('act') || combined.includes('sat')) category = 'act_sat';
    else if (combined.includes('net')) category = 'net';

    items.push({
      key: `notice-${items.length + 1}`,
      title,
      subtitle,
      category,
      status: normalizeNustStatus(combined, 'info'),
    });
    seen.add(key);
    if (items.length >= 8) break;
  }

  if (!items.length) {
    const plain = stripHtml(block).replace(/\s+/g, ' ').trim();
    const resultMatch = plain.match(/Result\s+NET[^.]{0,220}/i);
    const actSatMatch = plain.match(/ACT\s*\/\s*SAT[^.]{0,220}/i);

    if (resultMatch) {
      const title = sanitizeUpdateText(String(resultMatch[0] || ''), 180);
      const subtitle = 'Result-related update extracted from latest admissions notices.';
      if (!shouldIgnoreNustNoticeContent(`${title} ${subtitle}`)) {
        items.push({
          key: 'notice-result-fallback',
          title,
          subtitle,
          category: 'result',
          status: normalizeNustStatus(resultMatch[0], 'completed'),
        });
      }
    }

    if (actSatMatch) {
      const title = sanitizeUpdateText(String(actSatMatch[0] || ''), 180);
      const subtitle = 'ACT/SAT admission update extracted from latest admissions notices.';
      if (!shouldIgnoreNustNoticeContent(`${title} ${subtitle}`)) {
        items.push({
          key: 'notice-actsat-fallback',
          title,
          subtitle,
          category: 'act_sat',
          status: normalizeNustStatus(actSatMatch[0], 'upcoming'),
        });
      }
    }
  }

  return filterNustNotices(items);
}

function parseNustAdmissionsFeed(html) {
  const dates = parseNustImportantDates(html);
  const notices = filterNustNotices(parseNustNotices(html));

  return {
    dates: dates.length ? dates : DEFAULT_NUST_IMPORTANT_DATES,
    notices: notices.length ? notices : DEFAULT_NUST_IMPORTANT_NOTICES,
  };
}

async function refreshNustAdmissionsCache({ force = false } = {}) {
  const now = Date.now();
  const cacheAge = now - Number(nustUpdatesCache.fetchedAt || 0);
  if (!force && nustUpdatesCache.fetchedAt > 0 && cacheAge < NUST_ADMISSIONS_REFRESH_MS) {
    return;
  }
  if (nustUpdatesCache.refreshInFlight) {
    return;
  }

  nustUpdatesCache.refreshInFlight = true;
  nustUpdatesCache.lastAttemptAt = now;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch('https://ugadmissions.nust.edu.pk/', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NET360-App/1.0 (NUST admissions parser)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`NUST source returned status ${response.status}.`);
    }

    const html = await response.text();
    const parsed = parseNustAdmissionsFeed(html);

    nustUpdatesCache.fetchedAt = Date.now();
    nustUpdatesCache.lastError = '';
    nustUpdatesCache.dates = parsed.dates;
    nustUpdatesCache.notices = parsed.notices;
    nustUpdatesCache.updates = parsed.notices.map((item) => ({ title: item.title, subtitle: item.subtitle }));
  } catch (error) {
    nustUpdatesCache.lastError = error instanceof Error ? error.message : 'Unknown refresh error';
  } finally {
    nustUpdatesCache.refreshInFlight = false;
  }
}

function formatReportSubjectName(value) {
  return String(value || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sanitizeReportName(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'Student';
}

function drawReportSectionHeader(doc, title) {
  doc.moveDown(0.25);
  const startX = doc.page.margins.left;
  const sectionTop = doc.y;
  const sectionWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.roundedRect(startX, sectionTop, sectionWidth, 24, 6).fill('#eef2ff');
  doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text(String(title || ''), startX + 10, sectionTop + 7, {
    width: sectionWidth - 20,
  });
  doc.y = sectionTop + 30;
}

async function buildAnalyticsPdfBuffer({ attempts, user, questionBankTotal = 0 }) {
  const testsAttempted = attempts.length;
  const averageScore = testsAttempted
    ? Math.round(attempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / testsAttempted)
    : 0;
  const totalQuestions = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);
  const totalMinutes = attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0);
  const studyHours = Number((totalMinutes / 60).toFixed(1));
  const correctTotal = attempts.reduce((sum, item) => sum + (Number(item.correctAnswers) || Math.round((Number(item.score) || 0) * (Number(item.totalQuestions) || 0) / 100)), 0);
  const accuracy = totalQuestions ? Math.round((correctTotal / totalQuestions) * 100) : 0;
  const overallProgress = questionBankTotal > 0
    ? Math.min(100, Math.round((totalQuestions / questionBankTotal) * 100))
    : 0;

  const subjectMap = new Map();
  attempts.forEach((item) => {
    const key = String(item.subject || '').trim().toLowerCase();
    if (!key) return;
    const current = subjectMap.get(key) || { attempts: 0, questions: 0, correct: 0, scoreTotal: 0 };
    current.attempts += 1;
    current.questions += Number(item.totalQuestions) || 0;
    current.correct += Number(item.correctAnswers) || Math.round((Number(item.score) || 0) * (Number(item.totalQuestions) || 0) / 100);
    current.scoreTotal += Number(item.score) || 0;
    subjectMap.set(key, current);
  });

  const subjectRows = Array.from(subjectMap.entries())
    .map(([subject, stats]) => {
      const avgScore = stats.attempts ? Math.round(stats.scoreTotal / stats.attempts) : 0;
      const subjectAccuracy = stats.questions ? Math.round((stats.correct / stats.questions) * 100) : 0;
      return {
        subject: formatReportSubjectName(subject),
        attempts: stats.attempts,
        questions: stats.questions,
        accuracy: subjectAccuracy,
        avgScore,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const weeklyMap = new Map();
  attempts.forEach((item) => {
    const when = new Date(item.attemptedAt);
    const week = `${when.getFullYear()}-W${Math.ceil((when.getDate() + 6 - when.getDay()) / 7)}`;
    const existing = weeklyMap.get(week) || [];
    existing.push(Number(item.score) || 0);
    weeklyMap.set(week, existing);
  });

  const weeklyTrend = Array.from(weeklyMap.entries())
    .map(([week, scores]) => ({
      week,
      score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 46, right: 46 } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const logoPath = path.join(__dirname, '..', 'public', 'net360-logo.png');
    try {
      doc.image(logoPath, doc.page.margins.left, doc.page.margins.top - 4, { fit: [36, 36] });
    } catch {
      // Proceed without logo if the asset is unavailable.
    }

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text('NET360 Performance Report', doc.page.margins.left + 48, doc.page.margins.top, {
      align: 'left',
    });
    doc.fillColor('#475569').font('Helvetica').fontSize(10).text(`Exported on ${new Date().toLocaleString()}`, doc.page.margins.left + 48, doc.page.margins.top + 24);
    doc.moveDown(1.4);

    drawReportSectionHeader(doc, 'User Information');
    const fullName = `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim() || String(user.email || 'Student');
    const userInfoRows = [
      ['Name', fullName],
      ['Email', String(user.email || '-')],
      ['Target Program', String(user.targetProgram || '-')],
      ['Test Series', String(user.testSeries || '-')],
    ];
    userInfoRows.forEach(([label, value]) => {
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true });
      doc.fillColor('#0f172a').font('Helvetica').text(` ${value}`);
    });

    drawReportSectionHeader(doc, 'Test Summary');
    const summaryRows = [
      ['Number of Attempts', String(testsAttempted)],
      ['Accuracy Percentage', `${accuracy}%`],
      ['Average Score', `${averageScore}%`],
      ['Questions Attempted', String(totalQuestions)],
      ['Time Spent', `${studyHours} hour(s)`],
      ['Overall Progress Summary', questionBankTotal > 0 ? `${overallProgress}% of question bank (${totalQuestions}/${questionBankTotal})` : `${overallProgress}%`],
    ];
    summaryRows.forEach(([label, value]) => {
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true });
      doc.fillColor('#0f172a').font('Helvetica').text(` ${value}`);
    });

    drawReportSectionHeader(doc, 'Subject-wise Performance');
    if (!subjectRows.length) {
      doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10).text('No attempts available yet for subject-wise analysis.');
    } else {
      subjectRows.forEach((row) => {
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10).text(row.subject);
        doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Attempts: ${row.attempts} | Questions: ${row.questions} | Accuracy: ${row.accuracy}% | Avg Score: ${row.avgScore}%`);
        doc.moveDown(0.2);
      });
    }

    drawReportSectionHeader(doc, 'Analytics Charts');
    if (!weeklyTrend.length) {
      doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10).text('Not enough trend data yet to render chart snapshots.');
    } else {
      doc.fillColor('#334155').font('Helvetica').fontSize(9).text('Weekly score trend snapshot:');
      const chartX = doc.page.margins.left;
      const chartY = doc.y + 8;
      const chartHeight = 82;
      const chartWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const barCount = weeklyTrend.length;
      const gap = 8;
      const barWidth = Math.max(14, Math.floor((chartWidth - gap * (barCount - 1)) / barCount));

      doc.save();
      doc.rect(chartX, chartY, chartWidth, chartHeight).stroke('#cbd5e1');
      weeklyTrend.forEach((point, index) => {
        const normalized = Math.max(0, Math.min(100, Number(point.score) || 0));
        const h = Math.max(3, Math.round((normalized / 100) * (chartHeight - 20)));
        const x = chartX + index * (barWidth + gap);
        const y = chartY + chartHeight - h - 14;
        doc.rect(x, y, barWidth, h).fill('#4f46e5');
        doc.fillColor('#334155').font('Helvetica').fontSize(7).text(point.week.slice(-3), x, chartY + chartHeight - 12, { width: barWidth, align: 'center' });
      });
      doc.restore();
      doc.y = chartY + chartHeight + 6;
    }

    drawReportSectionHeader(doc, 'Overall Progress Summary');
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10).text(
      testsAttempted
        ? `You completed ${testsAttempted} attempt(s) with ${accuracy}% overall accuracy and ${studyHours} study hour(s). Keep improving weak subjects and maintain consistency in weekly practice.`
        : 'No attempts found yet. Start tests to generate meaningful analytics and subject-level insights.',
      { lineGap: 3 },
    );

    doc.end();
  });
}

async function issueAuthPayload(user, req) {
  const accessToken = makeAccessToken(user);
  const refreshToken = makeRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  user.refreshTokens = (user.refreshTokens || []).filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  user.refreshTokens.unshift({
    tokenHash: refreshTokenHash,
    expiresAt,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 250),
    ipAddress: String(req.ip || ''),
  });
  user.refreshTokens = user.refreshTokens.slice(0, 5);
  await user.save();

  return {
    token: accessToken,
    refreshToken,
    user: userPublic(user),
  };
}

function extractAccessToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  return String(req.query?.token || '').trim() || null;
}

async function resolveAuthenticatedUserFromToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  const user = await UserModel.findById(payload.userId);
  if (!user) {
    return { user: null, payload };
  }
  return { user, payload };
}

async function authMiddleware(req, res, next) {
  const token = extractAccessToken(req);

  if (!token) {
    await logSecurityEvent(req, {
      eventType: 'auth.missing_token',
      severity: 'warning',
    });
    res.status(401).json({ error: 'Missing authentication token.' });
    return;
  }

  try {
    const { user, payload } = await resolveAuthenticatedUserFromToken(token);
    if (!user) {
      await logSecurityEvent(req, {
        eventType: 'auth.user_not_found',
        severity: 'warning',
      });
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    const role = user.role || 'student';

    if (role === 'student') {
      const tokenSessionId = String(payload.sessionId || '');
      const activeSessionId = String(user.activeSession?.sessionId || '');
      if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
        await logSecurityEvent(req, {
          eventType: 'auth.session_mismatch',
          severity: 'warning',
          actorUserId: user._id,
          actorEmail: user.email,
        });
        res.status(401).json({ error: 'Session is no longer active. Please log in again.' });
        return;
      }

      user.activeSession.lastSeenAt = new Date();
      await user.save();
    }

    req.user = user;
    next();
  } catch {
    await logSecurityEvent(req, {
      eventType: 'auth.invalid_token',
      severity: 'warning',
    });
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    await logSecurityEvent(req, {
      eventType: 'auth.admin_required',
      severity: 'critical',
      actorUserId: req.user?._id || null,
      actorEmail: req.user?.email || '',
    });
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}

const NET_TEST_PROFILES = {
  'net-engineering': {
    label: 'NET Engineering',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'Physics', percentage: 30, sourceSubjects: ['physics'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      mathematics: 100,
      physics: 60,
      english: 40,
    },
  },
  'net-applied-sciences': {
    label: 'NET Applied Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Biology', percentage: 50, sourceSubjects: ['biology'] },
      { label: 'Chemistry', percentage: 30, sourceSubjects: ['chemistry'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      biology: 100,
      chemistry: 60,
      english: 40,
    },
  },
  'net-business-social-sciences': {
    label: 'NET Business & Social Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Quantitative Mathematics & Intelligence', percentage: 50, sourceSubjects: ['quantitative-mathematics', 'intelligence'] },
      { label: 'English', percentage: 50, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      'quantitative-mathematics': 100,
      intelligence: 100,
      english: 100,
    },
  },
  'net-architecture': {
    label: 'NET Architecture',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Design Aptitude', percentage: 50, sourceSubjects: ['design-aptitude'] },
      { label: 'Mathematics', percentage: 30, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      'design-aptitude': 100,
      mathematics: 60,
      english: 40,
    },
  },
  'net-natural-sciences': {
    label: 'NET Natural Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      mathematics: 100,
      english: 100,
    },
  },
};

function normalizeNetType(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'net-engineering';

  const aliases = {
    engineering: 'net-engineering',
    'net engineering': 'net-engineering',
    'net-engineering': 'net-engineering',
    applied: 'net-applied-sciences',
    'applied sciences': 'net-applied-sciences',
    'net applied sciences': 'net-applied-sciences',
    'net-applied-sciences': 'net-applied-sciences',
    business: 'net-business-social-sciences',
    'business & social sciences': 'net-business-social-sciences',
    'business and social sciences': 'net-business-social-sciences',
    'net-business-social-sciences': 'net-business-social-sciences',
    architecture: 'net-architecture',
    'net-architecture': 'net-architecture',
    'natural sciences': 'net-natural-sciences',
    'net-natural-sciences': 'net-natural-sciences',
  };

  return aliases[value] || value;
}

function allocateDistributionCounts(distribution, totalQuestions) {
  const base = distribution.map((item) => ({
    ...item,
    count: Math.floor((item.percentage / 100) * totalQuestions),
  }));

  let assigned = base.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;
  while (assigned < totalQuestions && base.length) {
    base[cursor % base.length].count += 1;
    assigned += 1;
    cursor += 1;
  }

  return base;
}

function pickFromPoolsByDistribution({ distribution, pool, totalQuestions, usedIds = new Set() }) {
  const counts = allocateDistributionCounts(distribution, totalQuestions);
  const selected = [];

  counts.forEach((entry) => {
    const candidates = shuffle(
      pool.filter((item) => {
        if (usedIds.has(String(item._id))) return false;
        return entry.sourceSubjects.includes(item.subject);
      }),
    );

    for (const question of candidates) {
      selected.push(question);
      usedIds.add(String(question._id));
      if (selected.filter((item) => entry.sourceSubjects.includes(item.subject)).length >= entry.count) {
        break;
      }
      if (selected.length >= totalQuestions) {
        break;
      }
    }
  });

  if (selected.length < totalQuestions) {
    const fallback = shuffle(pool.filter((item) => !usedIds.has(String(item._id))));
    for (const question of fallback) {
      selected.push(question);
      usedIds.add(String(question._id));
      if (selected.length >= totalQuestions) break;
    }
  }

  return selected.slice(0, totalQuestions);
}

function generateAdaptiveSet({ profile, allQuestions, weakTopics, questionCount, userProgress }) {
  const profileSubjects = Array.from(
    new Set(profile.distribution.flatMap((item) => item.sourceSubjects)),
  );
  const inScope = allQuestions.filter((item) => profileSubjects.includes(item.subject));

  const weakSet = new Set((weakTopics || []).map((item) => String(item).toLowerCase()));
  const averageScore = Number(userProgress?.averageScore || 0);
  const averageSecondsPerQuestion = Number(userProgress?.analytics?.averageSecondsPerQuestion || 0);

  const weakPool = inScope.filter((item) => weakSet.has(String(item.subject).toLowerCase()) || weakSet.has(String(item.topic).toLowerCase()));
  const mediumPool = inScope.filter((item) => item.difficulty === 'Medium');
  const hardPool = inScope.filter((item) => item.difficulty === 'Hard');
  const easyPool = inScope.filter((item) => item.difficulty === 'Easy');

  let easyRatio = 0.4;
  let mediumRatio = 0.4;
  let hardRatio = 0.2;

  if (averageScore >= 80 && (averageSecondsPerQuestion === 0 || averageSecondsPerQuestion <= 75)) {
    easyRatio = 0.2;
    mediumRatio = 0.4;
    hardRatio = 0.4;
  } else if (averageScore < 55 || averageSecondsPerQuestion >= 120) {
    easyRatio = 0.55;
    mediumRatio = 0.3;
    hardRatio = 0.15;
  }

  const easyCount = Math.max(1, Math.round(questionCount * easyRatio));
  const mediumCount = Math.max(1, Math.round(questionCount * mediumRatio));
  const hardCount = Math.max(1, questionCount - easyCount - mediumCount);

  const selected = [];
  const usedIds = new Set();

  const fromWeak = shuffle(weakPool.length ? weakPool : easyPool);
  for (const question of fromWeak) {
    if (usedIds.has(String(question._id))) continue;
    selected.push(question);
    usedIds.add(String(question._id));
    if (selected.length >= easyCount) break;
  }

  const fromMedium = shuffle(mediumPool);
  for (const question of fromMedium) {
    if (usedIds.has(String(question._id))) continue;
    selected.push(question);
    usedIds.add(String(question._id));
    if (selected.length >= easyCount + mediumCount) break;
  }

  const fromHard = shuffle(hardPool);
  for (const question of fromHard) {
    if (usedIds.has(String(question._id))) continue;
    selected.push(question);
    usedIds.add(String(question._id));
    if (selected.length >= easyCount + mediumCount + hardCount) break;
  }

  if (selected.length < questionCount) {
    const fill = shuffle(inScope.filter((item) => !usedIds.has(String(item._id))));
    for (const question of fill) {
      selected.push(question);
      usedIds.add(String(question._id));
      if (selected.length >= questionCount) break;
    }
  }

  const difficultyRank = { Easy: 1, Medium: 2, Hard: 3 };
  selected.sort((a, b) => difficultyRank[a.difficulty] - difficultyRank[b.difficulty]);

  return selected.slice(0, questionCount);
}

function generateStudyPlan({ targetDate, preparationLevel, weakSubjects, dailyStudyHours }) {
  const now = new Date();
  const examDate = targetDate ? new Date(targetDate) : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(1, Math.ceil((examDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  const weeks = Math.max(1, Math.ceil(daysLeft / 7));
  const focusSubjects = weakSubjects.length ? weakSubjects : ['mathematics', 'physics', 'chemistry', 'english'];

  const weeklyTargets = Array.from({ length: weeks }, (_, index) => {
    const subject = focusSubjects[index % focusSubjects.length];
    return {
      week: index + 1,
      focus: subject,
      target: `Complete ${subject} modules and one timed test`,
    };
  });

  const dailySchedule = [
    { block: 'Session 1', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.4)), activity: 'Concept learning + notes' },
    { block: 'Session 2', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.35)), activity: 'Topic MCQs + review' },
    { block: 'Session 3', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.25)), activity: 'Revision + weak topic drilling' },
  ];

  return {
    generatedAt: new Date().toISOString(),
    targetDate: examDate.toISOString().slice(0, 10),
    daysLeft,
    preparationLevel,
    weakSubjects,
    dailyStudyHours,
    weeklyTargets,
    dailySchedule,
    roadmap: [
      'Foundation and formula consolidation',
      'Topic-wise practice and adaptive drills',
      'Full mock tests and revision',
    ],
  };
}

async function refreshUserProgress(userId) {
  const attempts = await AttemptModel.find({ userId }).sort({ attemptedAt: -1 }).lean();

  const totalQuestions = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);
  const totalMinutes = attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0);
  const scores = attempts.map((item) => Number(item.score) || 0);
  const averageScore = scores.length ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length) : 0;

  const bySubject = new Map();
  let totalElapsedSeconds = 0;
  attempts.forEach((item) => {
    const current = bySubject.get(item.subject) || { total: 0, count: 0 };
    current.total += Number(item.score) || 0;
    current.count += 1;
    bySubject.set(item.subject, current);
    const elapsed = Number(item.metadata?.elapsedSeconds || 0);
    if (elapsed > 0) {
      totalElapsedSeconds += elapsed;
      return;
    }
    totalElapsedSeconds += Math.max(0, Number(item.durationMinutes || 0) * 60);
  });

  const weakTopics = [];
  const subjectInsights = [];
  for (const [subject, aggregate] of bySubject.entries()) {
    const avg = aggregate.count ? aggregate.total / aggregate.count : 0;
    subjectInsights.push({ subject, averageScore: Number(avg.toFixed(1)), attempts: aggregate.count });
    if (avg < 60) weakTopics.push(subject);
  }

  subjectInsights.sort((a, b) => b.averageScore - a.averageScore);
  const strengths = subjectInsights.filter((item) => item.averageScore >= 75).map((item) => item.subject);
  const weaknesses = subjectInsights.filter((item) => item.averageScore < 60).map((item) => item.subject);
  const averageSecondsPerQuestion = totalQuestions > 0
    ? Number((totalElapsedSeconds / totalQuestions).toFixed(1))
    : 0;

  let level = 'balanced';
  if (averageScore >= 80 && (averageSecondsPerQuestion === 0 || averageSecondsPerQuestion <= 75)) {
    level = 'advanced';
  } else if (averageScore < 55 || averageSecondsPerQuestion >= 120) {
    level = 'foundation';
  }

  await UserModel.findByIdAndUpdate(userId, {
    $set: {
      'progress.questionsSolved': totalQuestions,
      'progress.testsCompleted': attempts.length,
      'progress.averageScore': averageScore,
      'progress.completedTests': attempts.map((item) => String(item._id)),
      'progress.scores': scores,
      'progress.studyHours': Number((totalMinutes / 60).toFixed(1)),
      'progress.weakTopics': weakTopics,
      'progress.practiceHistory': attempts.slice(0, 200),
      'progress.analytics.weeklyProgress': attempts.slice(0, 12).map((item) => ({ date: item.attemptedAt, score: item.score })),
      'progress.analytics.accuracyTrend': attempts.slice(0, 12).map((item) => ({ date: item.attemptedAt, accuracy: item.score })),
      'progress.analytics.subjectInsights': subjectInsights,
      'progress.analytics.averageSecondsPerQuestion': averageSecondsPerQuestion,
      'progress.analytics.adaptiveProfile': {
        level,
        strengths,
        weaknesses,
      },
    },
  });
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', service: 'net360-api', mongo: 'connected' });
});

app.get('/api/admin/system-status', authMiddleware, requireAdmin, async (_req, res) => {
  const openAiContext = await getOpenAiClientContext();
  const configured = Boolean(openAiContext.client);
  const keySource = openAiContext.keySource;

  res.json({
    openai: {
      configured,
      model: openAiContext.model,
      keySource,
    },
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/admin/openai-health', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const probe = await runOpenAiConnectionProbe('admin-health-endpoint');
    res.status(Number(probe.status || (probe.ok ? 200 : 500))).json({
      openai: {
        configured: probe.configured,
        keySource: probe.keySource,
        model: probe.model,
        ok: probe.ok,
        category: probe.category,
        code: probe.code || null,
        message: probe.message,
        detail: probe.detail,
      },
      checkedAt: probe.checkedAt,
    });
  } catch (error) {
    res.status(500).json({
      openai: {
        configured: false,
        ok: false,
        category: 'endpoint-failure',
        code: null,
        message: 'OpenAI health check endpoint failed unexpectedly.',
        detail: error instanceof Error ? error.message : 'Unknown error.',
      },
      checkedAt: new Date().toISOString(),
    });
  }
});

app.get('/api/recommendations/adaptive', authMiddleware, async (req, res) => {
  const questionCount = clamp(Number(req.query.questionCount) || 15, 5, 40);
  const preferredSubject = String(req.query.subject || '').trim().toLowerCase();
  const weakTopics = Array.isArray(req.user.progress?.weakTopics)
    ? req.user.progress.weakTopics.map((item) => String(item || '').toLowerCase()).filter(Boolean)
    : [];

  const subjectFilter = preferredSubject ? { subject: preferredSubject } : {};
  const pool = await MCQModel.find(subjectFilter).select(MCQ_SELECT).limit(1200).lean();
  if (!pool.length) {
    res.status(404).json({ error: 'No questions available for adaptive recommendation.' });
    return;
  }

  const selected = generateAdaptiveSet({
    profile: {
      distribution: [{ sourceSubjects: Array.from(new Set(pool.map((item) => String(item.subject || '').toLowerCase()))) }],
    },
    allQuestions: pool,
    weakTopics,
    questionCount,
    userProgress: req.user.progress || defaultProgress(),
  });

  res.json({
    recommendation: {
      level: String(req.user.progress?.analytics?.adaptiveProfile?.level || 'balanced'),
      strengths: req.user.progress?.analytics?.adaptiveProfile?.strengths || [],
      weaknesses: req.user.progress?.analytics?.adaptiveProfile?.weaknesses || weakTopics,
      averageScore: Number(req.user.progress?.averageScore || 0),
      averageSecondsPerQuestion: Number(req.user.progress?.analytics?.averageSecondsPerQuestion || 0),
    },
    mcqs: selected.map((item) => serializeMcq(item)),
  });
});

app.get('/api/public/nust-admissions-feed', async (_req, res) => {
  const now = Date.now();
  const hasCache = Number(nustUpdatesCache.fetchedAt || 0) > 0;

  if (!hasCache) {
    await refreshNustAdmissionsCache({ force: true });
  } else if ((now - Number(nustUpdatesCache.fetchedAt || 0)) >= NUST_ADMISSIONS_REFRESH_MS) {
    void refreshNustAdmissionsCache({ force: true });
  }

  const source = nustUpdatesCache.lastError
    ? (hasCache ? 'stale-cache' : 'seed')
    : (hasCache ? 'cache' : 'seed');
  const safeNotices = filterNustNotices(nustUpdatesCache.notices);

  res.json({
    source,
    fetchedAt: nustUpdatesCache.fetchedAt ? new Date(nustUpdatesCache.fetchedAt).toISOString() : null,
    refreshIntervalMs: NUST_ADMISSIONS_REFRESH_MS,
    dates: Array.isArray(nustUpdatesCache.dates) && nustUpdatesCache.dates.length
      ? nustUpdatesCache.dates
      : DEFAULT_NUST_IMPORTANT_DATES,
    notices: safeNotices.length
      ? safeNotices
      : DEFAULT_NUST_IMPORTANT_NOTICES,
  });
});

app.get('/api/public/nust-updates', async (_req, res) => {
  const now = Date.now();
  if (nustUpdatesCache.fetchedAt <= 0 || (now - nustUpdatesCache.fetchedAt) >= NUST_UPDATES_CACHE_MS) {
    await refreshNustAdmissionsCache({ force: true });
  }
  const safeUpdates = filterNustNotices(nustUpdatesCache.updates);

  res.json({
    source: nustUpdatesCache.lastError ? 'stale-cache' : 'cache',
    fetchedAt: nustUpdatesCache.fetchedAt ? new Date(nustUpdatesCache.fetchedAt).toISOString() : null,
    updates: safeUpdates.length
      ? safeUpdates
      : DEFAULT_NUST_IMPORTANT_NOTICES.map((item) => ({ title: item.title, subtitle: item.subtitle })),
  });
});

app.post('/api/auth/signup-request', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const firstName = sanitizeHumanName(req.body?.firstName || '');
    const lastName = sanitizeHumanName(req.body?.lastName || '');
    const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber);
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const paymentTransactionId = sanitizePlainText(req.body?.paymentTransactionId || '', 120);

    let paymentProof;
    try {
      paymentProof = normalizePaymentProof(req.body?.paymentProof);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Payment proof is invalid.' });
      return;
    }

    if (!email || !mobileNumber || !paymentTransactionId || !paymentMethod) {
      res.status(400).json({ error: 'Email, mobile number, payment method, transaction ID, and payment proof are required.' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    if (!isValidMobileNumber(mobileNumber)) {
      res.status(400).json({ error: 'Enter a valid mobile number.' });
      return;
    }

    if (!['easypaisa', 'jazzcash', 'bank_transfer'].includes(paymentMethod)) {
      res.status(400).json({ error: 'Payment method must be one of: easypaisa, jazzcash, bank_transfer.' });
      return;
    }

    if (!isValidWhatsAppNumber(mobileNumber)) {
      res.status(400).json({ error: 'Enter a valid mobile number in international format (e.g. +923XXXXXXXXX).' });
      return;
    }

    const [existingByEmail, existingByMobile] = await Promise.all([
      UserModel.findOne({ email }).select('email phone subscription').lean(),
      findUserByMobileNumber(mobileNumber),
    ]);

    if (existingByEmail || existingByMobile) {
      const matchedBy = existingByEmail && existingByMobile
        ? 'both'
        : existingByEmail
          ? 'email'
          : 'mobile';
      const matchedUser = existingByEmail || existingByMobile;
      res.status(409).json({
        error: duplicateAccountErrorMessage(matchedBy, hasActiveSubscription(matchedUser)),
      });
      return;
    }

    const existingPending = await SignupRequestModel.findOne({
      status: 'pending',
      $or: [{ email }, { mobileNumber }],
    }).lean();
    if (existingPending) {
      const matchedBy = normalizeEmail(existingPending.email) === email
        ? 'email'
        : compactMobile(existingPending.mobileNumber) === compactMobile(mobileNumber)
          ? 'mobile'
          : 'both';
      res.status(409).json({
        error: `A pending signup request already exists for this ${getDuplicateAccountFieldLabel(matchedBy)}. Please wait for admin review or use different details.`,
      });
      return;
    }

    const request = await SignupRequestModel.create({
      email,
      firstName,
      lastName,
      mobileNumber,
      paymentMethod,
      paymentTransactionId,
      paymentProof,
      status: 'pending',
    });

    res.status(201).json({
      request: serializeSignupRequest(request),
      message: 'Signup request submitted. Wait for admin approval and token.',
    });
  } catch {
    res.status(500).json({ error: 'Could not submit signup request.' });
  }
});

app.post('/api/auth/signup-token-inbox', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber);

    if (!email || !mobileNumber) {
      res.status(400).json({ error: 'Email and mobile number are required.' });
      return;
    }

    const signupRequest = await SignupRequestModel.findOne({
      email,
      mobileNumber,
      status: 'approved',
      signupTokenId: { $ne: null },
    }).sort({ updatedAt: -1 });

    if (!signupRequest?.signupTokenId) {
      res.json({ tokenCode: '', requestStatus: 'pending' });
      return;
    }

    const signupToken = await SignupTokenModel.findById(signupRequest.signupTokenId);
    if (!signupToken) {
      res.json({ tokenCode: '', requestStatus: 'pending' });
      return;
    }

    if (signupToken.status !== 'active') {
      res.json({ tokenCode: '', requestStatus: signupToken.status });
      return;
    }

    if (!signupToken.inAppSentAt) {
      res.json({ tokenCode: '', requestStatus: 'approved' });
      return;
    }

    if (new Date(signupToken.expiresAt).getTime() <= Date.now()) {
      signupToken.status = 'expired';
      await signupToken.save();
      res.json({ tokenCode: '', requestStatus: 'expired' });
      return;
    }

    res.json({
      tokenCode: signupToken.code,
      requestStatus: 'sent',
      sentAt: signupToken.inAppSentAt ? new Date(signupToken.inAppSentAt).toISOString() : null,
      expiresAt: signupToken.expiresAt ? new Date(signupToken.expiresAt).toISOString() : null,
    });
  } catch {
    res.status(500).json({ error: 'Could not load signup token inbox.' });
  }
});

app.post('/api/auth/register-with-token', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const tokenCode = String(req.body?.tokenCode || '').trim().toUpperCase();
    const firstName = sanitizeHumanName(req.body?.firstName || '');
    const lastName = sanitizeHumanName(req.body?.lastName || '');
    const securityQuestion = normalizeSecurityQuestion(req.body?.securityQuestion || '');
    const securityAnswer = normalizeSecurityAnswer(req.body?.securityAnswer || '');
    const deviceId = sanitizeDeviceId(req.body?.deviceId || req.headers['user-agent'] || '');

    if (!email || !password || !tokenCode) {
      res.status(400).json({ error: 'Email, password, and token code are required.' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    if (!securityQuestion || securityQuestion.length < 10) {
      res.status(400).json({ error: 'Security question is required and should be clear.' });
      return;
    }

    if (!securityAnswer || securityAnswer.length < 3) {
      res.status(400).json({ error: 'Security answer is required.' });
      return;
    }

    const existingByEmail = await UserModel.findOne({ email }).select('email phone subscription').lean();
    if (existingByEmail) {
      res.status(409).json({
        error: duplicateAccountErrorMessage('email', hasActiveSubscription(existingByEmail)),
      });
      return;
    }

    const signupToken = await SignupTokenModel.findOne({ code: tokenCode });
    if (!signupToken) {
      res.status(400).json({ error: 'Invalid token code.' });
      return;
    }

    if (signupToken.status !== 'active') {
      res.status(400).json({ error: 'This token is no longer active.' });
      return;
    }

    if (new Date(signupToken.expiresAt).getTime() <= Date.now()) {
      signupToken.status = 'expired';
      await signupToken.save();
      res.status(400).json({ error: 'Token expired. Ask admin for a new token.' });
      return;
    }

    if (normalizeEmail(signupToken.email) !== email) {
      res.status(400).json({ error: 'Token was issued for a different email.' });
      return;
    }

    const signupRequest = await SignupRequestModel.findById(signupToken.signupRequestId);
    if (!signupRequest) {
      res.status(400).json({ error: 'Signup request not found for this token.' });
      return;
    }

    if (normalizeEmail(signupRequest.email) !== email) {
      res.status(400).json({ error: 'Signup request email mismatch for this token.' });
      return;
    }

    const mobileNumber = normalizeMobileNumber(signupRequest.mobileNumber);
    if (!mobileNumber) {
      res.status(400).json({ error: 'Mobile number is missing on signup request. Contact admin.' });
      return;
    }

    const existingByMobile = await findUserByMobileNumber(mobileNumber);
    if (existingByMobile) {
      res.status(409).json({
        error: duplicateAccountErrorMessage('mobile', hasActiveSubscription(existingByMobile)),
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const securityAnswerHash = await bcrypt.hash(securityAnswer, 12);
    const activeSession = {
      sessionId: crypto.randomUUID(),
      deviceId,
      startedAt: new Date(),
      lastSeenAt: new Date(),
    };

    const user = await UserModel.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phone: mobileNumber,
      role: ADMIN_EMAILS.includes(email) ? 'admin' : 'student',
      securityQuestion,
      securityAnswerHash,
      activeSession,
      preferences: defaultPreferences(),
      progress: defaultProgress(),
    });

    signupToken.status = 'used';
    signupToken.usedAt = new Date();
    signupToken.usedByUserId = user._id;
    await signupToken.save();

    signupRequest.status = 'completed';
    await signupRequest.save();

    const payload = await issueAuthPayload(user, req);
    res.status(201).json(payload);
  } catch {
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  res.status(410).json({
    error: 'Direct signup is disabled. Submit payment proof, get approval, then register using your token.',
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const forceLogoutOtherDevice = Boolean(req.body?.forceLogoutOtherDevice);
    const deviceId = sanitizeDeviceId(req.body?.deviceId || req.headers['user-agent'] || '');
    if (!email || !password) {
      await logSecurityEvent(req, {
        eventType: 'auth.login_missing_credentials',
        severity: 'warning',
        actorEmail: email,
      });
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (!isValidEmail(email)) {
      await logSecurityEvent(req, {
        eventType: 'auth.login_invalid_email',
        severity: 'warning',
        actorEmail: email,
      });
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      await logSecurityEvent(req, {
        eventType: 'auth.login_user_not_found',
        severity: 'warning',
        actorEmail: email,
      });
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const isValid = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!isValid) {
      await logSecurityEvent(req, {
        eventType: 'auth.login_invalid_password',
        severity: 'warning',
        actorUserId: user._id,
        actorEmail: user.email,
      });
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    let role = user.role || 'student';
    // Keep admin access resilient when ADMIN_EMAILS is configured after initial account creation.
    if (role !== 'admin' && ADMIN_EMAILS.includes(email)) {
      user.role = 'admin';
      user.updatedAt = new Date();
      await user.save();
      role = 'admin';
    }

    if (role === 'student') {
      const activeSession = user.activeSession || null;
      if (activeSession && activeSession.deviceId && activeSession.deviceId !== deviceId && !forceLogoutOtherDevice) {
        await logSecurityEvent(req, {
          eventType: 'auth.active_session_conflict',
          severity: 'warning',
          actorUserId: user._id,
          actorEmail: user.email,
          metadata: {
            existingDeviceId: activeSession.deviceId,
            attemptedDeviceId: deviceId,
          },
        });
        res.status(409).json({
          error: 'You are already logged in on another device. Logout there first or confirm switch.',
          code: 'active_session_exists',
          activeSession: {
            deviceId: activeSession.deviceId,
            lastSeenAt: activeSession.lastSeenAt,
          },
        });
        return;
      }

      user.activeSession = {
        sessionId: crypto.randomUUID(),
        deviceId,
        startedAt: new Date(),
        lastSeenAt: new Date(),
      };
    }

    const payload = await issueAuthPayload(user, req);
    await logSecurityEvent(req, {
      eventType: 'auth.login_success',
      severity: 'info',
      actorUserId: user._id,
      actorEmail: user.email,
    });
    res.json(payload);
  } catch {
    await logSecurityEvent(req, {
      eventType: 'auth.login_error',
      severity: 'critical',
    });
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    await logSecurityEvent(req, {
      eventType: 'auth.refresh_missing_token',
      severity: 'warning',
    });
    res.status(400).json({ error: 'Refresh token is required.' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    if (payload?.type !== 'refresh') {
      await logSecurityEvent(req, {
        eventType: 'auth.refresh_invalid_type',
        severity: 'warning',
      });
      res.status(401).json({ error: 'Invalid refresh token.' });
      return;
    }

    const user = await UserModel.findById(payload.userId);
    if (!user) {
      await logSecurityEvent(req, {
        eventType: 'auth.refresh_user_not_found',
        severity: 'warning',
      });
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    const found = (user.refreshTokens || []).find((item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now());

    if (!found) {
      await logSecurityEvent(req, {
        eventType: 'auth.refresh_revoked',
        severity: 'warning',
        actorUserId: user._id,
        actorEmail: user.email,
      });
      res.status(401).json({ error: 'Refresh token revoked or expired.' });
      return;
    }

    if ((user.role || 'student') === 'student') {
      const tokenSessionId = String(payload.sessionId || '');
      const activeSessionId = String(user.activeSession?.sessionId || '');
      if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
        user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
        await user.save();
        await logSecurityEvent(req, {
          eventType: 'auth.refresh_session_mismatch',
          severity: 'warning',
          actorUserId: user._id,
          actorEmail: user.email,
        });
        res.status(401).json({ error: 'Session ended. Please log in again.' });
        return;
      }
    }

    user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
    await user.save();

    const newPayload = await issueAuthPayload(user, req);
    await logSecurityEvent(req, {
      eventType: 'auth.refresh_success',
      severity: 'info',
      actorUserId: user._id,
      actorEmail: user.email,
    });
    res.json(newPayload);
  } catch {
    await logSecurityEvent(req, {
      eventType: 'auth.refresh_invalid_token',
      severity: 'warning',
    });
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();

  if (!refreshToken) {
    res.json({ message: 'Logged out.' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await UserModel.findById(payload.userId);
    if (user) {
      const tokenHash = hashToken(refreshToken);
      user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);

      if ((user.role || 'student') === 'student') {
        const tokenSessionId = String(payload.sessionId || '');
        if (tokenSessionId && String(user.activeSession?.sessionId || '') === tokenSessionId) {
          user.activeSession = null;
        }
      }

      await user.save();
      await logSecurityEvent(req, {
        eventType: 'auth.logout_success',
        severity: 'info',
        actorUserId: user._id,
        actorEmail: user.email,
      });
    }
  } catch {
    await logSecurityEvent(req, {
      eventType: 'auth.logout_invalid_token',
      severity: 'warning',
    });
    // Ignore invalid token on logout.
  }

  res.json({ message: 'Logged out.' });
});

app.post('/api/auth/delete-account', authMiddleware, async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    const confirmationText = String(req.body?.confirmationText || '').trim();
    if (!password) {
      res.status(400).json({ error: 'Password is required to delete account.' });
      return;
    }

    if (confirmationText !== 'DELETE') {
      res.status(400).json({ error: 'Type DELETE to confirm permanent account deletion.' });
      return;
    }

    const user = await UserModel.findById(req.user._id).select('_id passwordHash role email phone');
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, String(user.passwordHash || ''));
    if (!passwordMatches) {
      res.status(401).json({ error: 'Incorrect password. Account deletion cancelled.' });
      return;
    }

    const userId = user._id;

    await Promise.all([
      AttemptModel.deleteMany({ userId }),
      TestSessionModel.deleteMany({ userId }),
      AIUsageModel.deleteMany({ userId }),
      PasswordRecoveryRequestModel.deleteMany({ userId }),
      SignupRequestModel.deleteMany({ email: normalizeEmail(user.email) }),
      SignupTokenModel.deleteMany({ email: normalizeEmail(user.email) }),
      PremiumSubscriptionRequestModel.deleteMany({ userId }),
      CommunityProfileModel.deleteMany({ userId }),
      CommunityConnectionRequestModel.deleteMany({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
      }),
      CommunityConnectionModel.deleteMany({
        $or: [{ participantA: userId }, { participantB: userId }],
      }),
      CommunityMessageModel.deleteMany({ senderUserId: userId }),
      CommunityReportModel.deleteMany({
        $or: [{ reporterUserId: userId }, { reportedUserId: userId }],
      }),
      CommunityBlockModel.deleteMany({ userId }),
      CommunityRoomPostModel.deleteMany({ authorUserId: userId }),
      CommunityQuizChallengeModel.deleteMany({
        $or: [{ challengerUserId: userId }, { opponentUserId: userId }],
      }),
    ]);

    await UserModel.deleteOne({ _id: userId });

    res.json({
      message: 'Your account has been permanently deleted. To use NET360 again, create a new account and obtain access again.',
    });
  } catch {
    res.status(500).json({ error: 'Could not delete account. Please try again.' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber || '');

  if (!email && !mobileNumber) {
    res.status(400).json({ error: 'Registered email or mobile number is required.' });
    return;
  }

  if (email && !isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  if (mobileNumber && !isValidMobileNumber(mobileNumber)) {
    res.status(400).json({ error: 'Enter a valid mobile number.' });
    return;
  }

  let user = null;
  let matchedBy = 'none';

  if (email) {
    user = await UserModel.findOne({ email });
    if (user) matchedBy = 'email';
  }

  if (!user && mobileNumber) {
    user = await findUserDocumentByMobileNumber(mobileNumber);
    if (user) matchedBy = 'mobile';
  }

  if (user && email && mobileNumber) {
    const matchesMobile = compactMobile(user.phone) === compactMobile(mobileNumber);
    if (!matchesMobile) {
      user = null;
      matchedBy = 'none';
    }
  }

  const identifier = email || mobileNumber;
  const normalizedIdentifier = email || compactMobile(mobileNumber);

  if (!user || !String(user.securityQuestion || '').trim() || !String(user.securityAnswerHash || '').trim()) {
    await PasswordRecoveryRequestModel.create({
      identifier,
      normalizedIdentifier,
      matchedBy: 'none',
      recoveryStatus: 'not_found',
      dispatches: [],
      requestedIp: getClientIp(req),
      requestedUserAgent: getUserAgent(req),
    });

    res.json({ message: 'No active account matched this identifier.' });
    return;
  }

  const challengeToken = crypto.randomBytes(24).toString('hex');
  const challengeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  user.securityChallengeTokenHash = hashToken(challengeToken);
  user.securityChallengeExpiresAt = challengeExpiresAt;
  await user.save();

  await PasswordRecoveryRequestModel.create({
    identifier,
    normalizedIdentifier,
    matchedBy,
    userId: user._id,
    userName: `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim(),
    email: normalizeEmail(user.email || ''),
    mobileNumber: normalizeMobileNumber(user.phone || ''),
    recoveryStatus: 'partial',
    dispatches: [],
    tokenExpiresAt: challengeExpiresAt,
    requestedIp: getClientIp(req),
    requestedUserAgent: getUserAgent(req),
  });

  res.json({
    message: 'Security question loaded. Answer it to continue.',
    securityQuestion: String(user.securityQuestion || ''),
    challengeToken,
    challengeExpiresAt: challengeExpiresAt.toISOString(),
  });
});

app.post('/api/auth/forgot-password/verify-security-answer', async (req, res) => {
  const challengeToken = String(req.body?.challengeToken || '').trim();
  const securityAnswer = normalizeSecurityAnswer(req.body?.securityAnswer || '');

  if (!challengeToken || !securityAnswer) {
    res.status(400).json({ error: 'Challenge token and security answer are required.' });
    return;
  }

  const user = await UserModel.findOne({
    securityChallengeTokenHash: hashToken(challengeToken),
    securityChallengeExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired recovery verification session.' });
    return;
  }

  const answerMatches = await bcrypt.compare(securityAnswer, String(user.securityAnswerHash || ''));
  if (!answerMatches) {
    await PasswordRecoveryRequestModel.create({
      identifier: normalizeEmail(user.email || ''),
      normalizedIdentifier: normalizeEmail(user.email || ''),
      matchedBy: 'email',
      userId: user._id,
      userName: `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim(),
      email: normalizeEmail(user.email || ''),
      mobileNumber: normalizeMobileNumber(user.phone || ''),
      recoveryStatus: 'failed',
      dispatches: [],
      requestedIp: getClientIp(req),
      requestedUserAgent: getUserAgent(req),
    });
    res.status(401).json({ error: 'Security answer is incorrect.' });
    return;
  }

  const resetToken = crypto.randomBytes(24).toString('hex');
  const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  user.resetPasswordTokenHash = hashToken(resetToken);
  user.resetPasswordExpiresAt = tokenExpiresAt;
  user.securityChallengeTokenHash = null;
  user.securityChallengeExpiresAt = null;
  await user.save();

  const request = await PasswordRecoveryRequestModel.create({
    identifier: normalizeEmail(user.email || ''),
    normalizedIdentifier: normalizeEmail(user.email || ''),
    matchedBy: 'email',
    userId: user._id,
    userName: `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim(),
    email: normalizeEmail(user.email || ''),
    mobileNumber: normalizeMobileNumber(user.phone || ''),
    recoveryStatus: 'sent',
    dispatches: [],
    tokenExpiresAt,
    requestedIp: getClientIp(req),
    requestedUserAgent: getUserAgent(req),
  });

  res.json({
    message: 'Security verification successful. Use the generated reset token to set a new password.',
    resetToken,
    request: serializePasswordRecoveryRequest(request),
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token and new password are required.' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  user.securityChallengeTokenHash = null;
  user.securityChallengeExpiresAt = null;
  user.refreshTokens = [];
  await user.save();

  res.json({ message: 'Password reset successful.' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: userPublic(req.user) });
});

app.get('/api/stream', async (req, res) => {
  const token = extractAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing authentication token.' });
    return;
  }

  try {
    const { user } = await resolveAuthenticatedUserFromToken(token);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    addSseClient(user.role === 'admin' ? 'admin' : 'student', user._id, res);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  if (Object.prototype.hasOwnProperty.call(req.body, 'firstName')) {
    req.user.firstName = sanitizeHumanName(req.body.firstName || '');
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'lastName')) {
    req.user.lastName = sanitizeHumanName(req.body.lastName || '');
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
    req.user.phone = sanitizePlainText(req.body.phone || '', 30);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'city')) {
    req.user.city = sanitizePlainText(req.body.city || '', 80);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'targetProgram')) {
    req.user.targetProgram = sanitizePlainText(req.body.targetProgram || '', 120);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'testSeries')) {
    req.user.testSeries = sanitizePlainText(req.body.testSeries || '', 50);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'sscPercentage')) {
    req.user.sscPercentage = sanitizePlainText(req.body.sscPercentage || '', 12);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'hsscPercentage')) {
    req.user.hsscPercentage = sanitizePlainText(req.body.hsscPercentage || '', 12);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'testDate')) {
    req.user.testDate = sanitizePlainText(req.body.testDate || '', 40);
  }

  await req.user.save();
  broadcastSyncEvent({
    role: 'student',
    event: 'sync',
    data: { type: 'profile.updated', userId: String(req.user._id) },
  });
  if ((req.user.role || 'student') === 'admin') {
    broadcastSyncEvent({ role: 'admin', event: 'sync', data: { type: 'admin.profile.updated' } });
  }
  res.json({ user: userPublic(req.user) });
});

app.put('/api/auth/preferences', authMiddleware, async (req, res) => {
  const current = req.user.preferences || defaultPreferences();
  req.user.preferences = {
    emailNotifications: typeof req.body?.emailNotifications === 'boolean' ? req.body.emailNotifications : current.emailNotifications,
    dailyReminders: typeof req.body?.dailyReminders === 'boolean' ? req.body.dailyReminders : current.dailyReminders,
    performanceReports: typeof req.body?.performanceReports === 'boolean' ? req.body.performanceReports : current.performanceReports,
  };

  await req.user.save();
  broadcastSyncEvent({
    role: 'student',
    event: 'sync',
    data: { type: 'preferences.updated', userId: String(req.user._id) },
  });
  res.json({ user: userPublic(req.user) });
});

async function communityGuard(req, res) {
  const blocked = await ensureCommunityAccess(req.user._id);
  if (!blocked) return false;
  res.status(403).json({ error: blocked.reason, code: blocked.code || 'COMMUNITY_BLOCKED' });
  return true;
}

async function communityWriteGuard(req, res) {
  const blocked = await ensureCommunityWritable(req.user._id);
  if (!blocked) return false;
  res.status(403).json({ error: blocked.reason, code: blocked.code || 'COMMUNITY_BLOCKED', restriction: blocked.restriction || null });
  return true;
}

app.get('/api/community/profile', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const profile = await getOrCreateCommunityProfile(req.user);
  res.json({ profile: serializeCommunityUser({ user: req.user, profile, includePrivatePicture: true }) });
});

app.put('/api/community/profile', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const profile = await getOrCreateCommunityProfile(req.user);

  const nextUsername = normalizeUsername(req.body?.username || profile.username);
  if (!nextUsername) {
    res.status(400).json({ error: 'username is required.' });
    return;
  }

  const taken = await CommunityProfileModel.findOne({
    username: nextUsername,
    userId: { $ne: req.user._id },
  }).lean();
  if (taken) {
    res.status(400).json({ error: 'Username is already taken.' });
    return;
  }

  profile.username = nextUsername;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'shareProfilePicture')) {
    profile.shareProfilePicture = Boolean(req.body?.shareProfilePicture);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'profilePictureDataUrl')) {
    try {
      profile.profilePictureUrl = normalizeCommunityProfilePicture(req.body?.profilePictureDataUrl);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid profile picture upload.' });
      return;
    }
  } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'profilePictureUrl')) {
    // Backward compatibility for older clients still sending URL field.
    profile.profilePictureUrl = String(req.body?.profilePictureUrl || '').trim();
  }
  if (Array.isArray(req.body?.favoriteSubjects)) {
    profile.favoriteSubjects = normalizeSubjectList(req.body.favoriteSubjects, 8);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'targetNetType')) {
    profile.targetNetType = normalizeCommunityNetType(req.body?.targetNetType);
  }
  if (Array.isArray(req.body?.subjectsNeedHelp)) {
    profile.subjectsNeedHelp = normalizeSubjectList(req.body.subjectsNeedHelp, 10);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'preparationLevel')) {
    profile.preparationLevel = normalizePreparationLevel(req.body?.preparationLevel);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'studyTimePreference')) {
    profile.studyTimePreference = normalizeStudyTimePreference(req.body?.studyTimePreference);
  }
  if (req.body?.testScoreRange && typeof req.body.testScoreRange === 'object') {
    const min = Math.max(0, Math.min(200, Number(req.body.testScoreRange?.min ?? profile.testScoreRange?.min ?? 0)));
    const max = Math.max(min, Math.min(200, Number(req.body.testScoreRange?.max ?? profile.testScoreRange?.max ?? 200)));
    profile.testScoreRange = { min, max };
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
    profile.bio = String(req.body?.bio || '').trim().slice(0, 280);
  }

  await profile.save();
  res.json({ profile: serializeCommunityUser({ user: req.user, profile, includePrivatePicture: true }) });
});

app.get('/api/community/users/search', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const q = String(req.query.q || '').trim().toLowerCase();
  const me = String(req.user._id);

  const queryRegex = q ? containsRegex(q, 50) : null;
  const profileMatches = queryRegex
    ? await CommunityProfileModel.find({ username: queryRegex })
      .select(COMMUNITY_PROFILE_SELECT)
      .limit(80)
      .lean()
    : await CommunityProfileModel.find({})
      .select(COMMUNITY_PROFILE_SELECT)
      .limit(80)
      .lean();

  const nameMatches = queryRegex
    ? await UserModel.find({
      role: 'student',
      $or: [
        { firstName: queryRegex },
        { lastName: queryRegex },
      ],
    })
      .select(COMMUNITY_USER_SELECT)
      .limit(80)
      .lean()
    : [];

  const profileUserIds = profileMatches.map((item) => String(item.userId));
  const nameUserIds = nameMatches.map((item) => String(item._id));
  const candidateSeedIds = Array.from(new Set([...profileUserIds, ...nameUserIds]))
    .filter((id) => id !== me)
    .slice(0, 120);

  const [profiles, users] = await Promise.all([
    CommunityProfileModel.find({ userId: { $in: candidateSeedIds } })
      .select(COMMUNITY_PROFILE_SELECT)
      .lean(),
    UserModel.find({ _id: { $in: candidateSeedIds }, role: 'student' })
      .select(COMMUNITY_USER_SELECT)
      .lean(),
  ]);

  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const candidateIds = profiles
    .map((item) => String(item.userId))
    .filter((id) => usersById.has(id));

  const participantKeys = candidateIds.map((userId) => connectionKey(req.user._id, userId));
  const [connections, pendingToRows, pendingFromRows] = await Promise.all([
    CommunityConnectionModel.find({ participantKey: { $in: participantKeys } }).select('participantKey').lean(),
    CommunityConnectionRequestModel.find({
      fromUserId: req.user._id,
      toUserId: { $in: candidateIds },
      status: 'pending',
    }).select('toUserId').lean(),
    CommunityConnectionRequestModel.find({
      fromUserId: { $in: candidateIds },
      toUserId: req.user._id,
      status: 'pending',
    }).select('fromUserId').lean(),
  ]);

  const connectedKeys = new Set(connections.map((item) => String(item.participantKey)));
  const pendingTo = new Set(pendingToRows.map((item) => String(item.toUserId)));
  const pendingFrom = new Set(pendingFromRows.map((item) => String(item.fromUserId)));

  const rows = [];
  for (const profile of profiles) {
    const userId = String(profile.userId);
    if (userId === me) continue;
    const user = usersById.get(userId);
    if (!user) continue;

    const status = connectedKeys.has(connectionKey(req.user._id, userId))
      ? 'connected'
      : pendingTo.has(userId)
        ? 'pending-sent'
        : pendingFrom.has(userId)
          ? 'pending-received'
          : 'none';

    rows.push({
      ...serializeCommunityUser({ user, profile }),
      connectionStatus: status,
    });
  }

  const normalizedQuery = q.toLowerCase();
  const ranked = rows
    .map((item) => {
      const username = String(item.username || '').toLowerCase();
      const fullName = `${String(item.firstName || '')} ${String(item.lastName || '')}`.trim().toLowerCase();
      let score = 0;
      if (!normalizedQuery) score += 1;
      if (username === normalizedQuery) score += 100;
      else if (username.startsWith(normalizedQuery)) score += 70;
      else if (username.includes(normalizedQuery)) score += 45;
      if (fullName === normalizedQuery) score += 95;
      else if (fullName.startsWith(normalizedQuery)) score += 60;
      else if (fullName.includes(normalizedQuery)) score += 35;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, 30);

  res.json({ users: ranked });
});

app.post('/api/community/connections/request', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const toUserId = String(req.body?.toUserId || '').trim();
  if (!isValidObjectId(toUserId)) {
    res.status(400).json({ error: 'Valid target user id is required.' });
    return;
  }
  if (String(req.user._id) === toUserId) {
    res.status(400).json({ error: 'You cannot connect to yourself.' });
    return;
  }

  const target = await UserModel.findById(toUserId).lean();
  if (!target || target.role !== 'student') {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const targetBlocked = await ensureCommunityAccess(toUserId);
  if (targetBlocked) {
    res.status(403).json({ error: 'This user is not available in community right now.' });
    return;
  }

  const key = connectionKey(req.user._id, toUserId);
  const existingConnection = await CommunityConnectionModel.findOne({ participantKey: key }).lean();
  if (existingConnection) {
    res.status(400).json({ error: 'You are already connected.' });
    return;
  }

  const existingPending = await CommunityConnectionRequestModel.findOne({
    $or: [
      { fromUserId: req.user._id, toUserId, status: 'pending' },
      { fromUserId: toUserId, toUserId: req.user._id, status: 'pending' },
    ],
  }).lean();
  if (existingPending) {
    res.status(400).json({ error: 'A pending connection request already exists.' });
    return;
  }

  const created = await CommunityConnectionRequestModel.create({
    fromUserId: req.user._id,
    toUserId,
    status: 'pending',
  });

  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: { type: 'community.connection.requested', fromUserId: String(req.user._id), toUserId },
  });

  res.status(201).json({ requestId: String(created._id) });
});

app.get('/api/community/connections/requests', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  const [incoming, outgoing] = await Promise.all([
    CommunityConnectionRequestModel.find({ toUserId: req.user._id, status: 'pending' })
      .select(COMMUNITY_REQUEST_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CommunityConnectionRequestModel.find({ fromUserId: req.user._id, status: 'pending' })
      .select(COMMUNITY_REQUEST_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const relatedUserIds = Array.from(new Set([
    ...incoming.map((item) => String(item.fromUserId)),
    ...outgoing.map((item) => String(item.toUserId)),
  ]));

  const [users, profiles] = await Promise.all([
    UserModel.find({ _id: { $in: relatedUserIds } }).select(COMMUNITY_USER_SELECT).lean(),
    CommunityProfileModel.find({ userId: { $in: relatedUserIds } }).select(COMMUNITY_PROFILE_SELECT).lean(),
  ]);
  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const profilesByUserId = new Map(profiles.map((item) => [String(item.userId), item]));

  const mapRequest = (item, direction) => {
    const otherUserId = direction === 'incoming' ? String(item.fromUserId) : String(item.toUserId);
    const user = usersById.get(otherUserId);
    const profile = profilesByUserId.get(otherUserId);
    if (!user) return null;
    return {
      id: String(item._id),
      direction,
      status: String(item.status || 'pending'),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      user: serializeCommunityUser({ user, profile }),
    };
  };

  res.json({
    page,
    limit,
    incoming: incoming.map((item) => mapRequest(item, 'incoming')).filter(Boolean),
    outgoing: outgoing.map((item) => mapRequest(item, 'outgoing')).filter(Boolean),
  });
});

app.post('/api/community/connections/requests/:requestId/respond', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const requestId = String(req.params.requestId || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!isValidObjectId(requestId)) {
    res.status(400).json({ error: 'Valid request id is required.' });
    return;
  }
  if (!['accept', 'reject'].includes(action)) {
    res.status(400).json({ error: 'action must be accept or reject.' });
    return;
  }

  const request = await CommunityConnectionRequestModel.findById(requestId);
  if (!request || String(request.toUserId) !== String(req.user._id)) {
    res.status(404).json({ error: 'Connection request not found.' });
    return;
  }
  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Request is already handled.' });
    return;
  }

  if (action === 'accept') {
    const key = connectionKey(request.fromUserId, request.toUserId);
    await CommunityConnectionModel.findOneAndUpdate(
      { participantKey: key },
      {
        $setOnInsert: {
          participantA: String(request.fromUserId) < String(request.toUserId) ? request.fromUserId : request.toUserId,
          participantB: String(request.fromUserId) < String(request.toUserId) ? request.toUserId : request.fromUserId,
          participantKey: key,
        },
      },
      { upsert: true, new: true },
    );
    request.status = 'accepted';
  } else {
    request.status = 'rejected';
  }

  await request.save();
  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: {
      type: 'community.connection.responded',
      requestId: String(request._id),
      status: String(request.status || ''),
      fromUserId: String(request.fromUserId),
      toUserId: String(request.toUserId),
    },
  });
  res.json({ ok: true, status: request.status });
});

app.get('/api/community/connections', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const myId = String(req.user._id);
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 50, maxLimit: 120 });
  const connections = await CommunityConnectionModel.find({
    $or: [{ participantA: myId }, { participantB: myId }],
  })
    .select(COMMUNITY_CONNECTION_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const otherUserIds = connections.map((item) => (String(item.participantA) === myId ? String(item.participantB) : String(item.participantA)));
  const connectionIds = connections.map((item) => item._id);

  const [users, profiles, unreadRows] = await Promise.all([
    UserModel.find({ _id: { $in: otherUserIds } }).select(COMMUNITY_USER_SELECT).lean(),
    CommunityProfileModel.find({ userId: { $in: otherUserIds } }).select(COMMUNITY_PROFILE_SELECT).lean(),
    CommunityMessageModel.aggregate([
      {
        $match: {
          connectionId: { $in: connectionIds },
          senderUserId: { $ne: req.user._id },
          readByUserIds: { $ne: req.user._id },
        },
      },
      { $group: { _id: '$connectionId', count: { $sum: 1 } } },
    ]),
  ]);
  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const profilesById = new Map(profiles.map((item) => [String(item.userId), item]));
  const unreadByConnection = new Map(unreadRows.map((item) => [String(item._id), Number(item.count || 0)]));

  const rows = [];
  for (const connection of connections) {
    const otherUserId = String(connection.participantA) === myId ? String(connection.participantB) : String(connection.participantA);
    const user = usersById.get(otherUserId);
    if (!user) continue;
    const profile = profilesById.get(otherUserId);
    const blockedByUserIds = Array.isArray(connection.blockedByUserIds)
      ? connection.blockedByUserIds.map((entry) => String(entry))
      : [];
    const blockedByMe = blockedByUserIds.includes(myId);
    const blockedByOther = blockedByUserIds.includes(otherUserId);

    rows.push({
      connectionId: String(connection._id),
      connectedAt: connection.createdAt ? new Date(connection.createdAt).toISOString() : null,
      user: serializeCommunityUser({ user, profile }),
      unreadCount: unreadByConnection.get(String(connection._id)) || 0,
      blockedByMe,
      blockedByOther,
      canMessage: !(blockedByMe || blockedByOther),
    });
  }

  res.json({ page, limit, connections: rows });
});

app.post('/api/community/connections/:connectionId/unfriend', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const connectionId = String(req.params.connectionId || '').trim();
  if (!isValidObjectId(connectionId)) {
    res.status(400).json({ error: 'Valid connection id is required.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId);
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }

  const myId = String(req.user._id);
  const participants = [String(connection.participantA), String(connection.participantB)];
  if (!participants.includes(myId)) {
    res.status(403).json({ error: 'Access denied for this connection.' });
    return;
  }

  await CommunityMessageModel.deleteMany({ connectionId: connection._id });
  await CommunityConnectionModel.deleteOne({ _id: connection._id });

  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: {
      type: 'community.connection.unfriended',
      connectionId,
      actorUserId: myId,
      participantA: participants[0],
      participantB: participants[1],
    },
  });

  res.json({ ok: true });
});

app.post('/api/community/connections/:connectionId/block', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const connectionId = String(req.params.connectionId || '').trim();
  const blocked = Boolean(req.body?.blocked);
  if (!isValidObjectId(connectionId)) {
    res.status(400).json({ error: 'Valid connection id is required.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId);
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }

  const myId = String(req.user._id);
  const participants = [String(connection.participantA), String(connection.participantB)];
  if (!participants.includes(myId)) {
    res.status(403).json({ error: 'Access denied for this connection.' });
    return;
  }

  const update = blocked
    ? { $addToSet: { blockedByUserIds: req.user._id } }
    : { $pull: { blockedByUserIds: req.user._id } };
  await CommunityConnectionModel.updateOne({ _id: connection._id }, update);

  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: {
      type: blocked ? 'community.connection.blocked' : 'community.connection.unblocked',
      connectionId,
      actorUserId: myId,
      participantA: participants[0],
      participantB: participants[1],
    },
  });

  res.json({ ok: true, blocked });
});

app.get('/api/community/messages/:connectionId', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 120, maxLimit: 300 });
  const connectionId = String(req.params.connectionId || '').trim();
  if (!isValidObjectId(connectionId)) {
    res.status(400).json({ error: 'Valid connection id is required.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }
  const myId = String(req.user._id);
  if (![String(connection.participantA), String(connection.participantB)].includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const messages = await CommunityMessageModel.find({ connectionId })
    .select(COMMUNITY_MESSAGE_SELECT)
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  await CommunityMessageModel.updateMany(
    {
      connectionId,
      senderUserId: { $ne: req.user._id },
      readByUserIds: { $ne: req.user._id },
    },
    { $addToSet: { readByUserIds: req.user._id } },
  );

  res.json({
    page,
    limit,
    messages: messages.map((item) => serializeCommunityMessage(item)),
  });
});

app.post('/api/community/messages/:connectionId', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const connectionId = String(req.params.connectionId || '').trim();
  const text = String(req.body?.text || '').trim();
  if (!isValidObjectId(connectionId)) {
    res.status(400).json({ error: 'Valid connection id is required.' });
    return;
  }
  const messageType = String(req.body?.messageType || 'text').trim().toLowerCase();
  const supportedTypes = new Set(['text', 'file', 'voice', 'call-invite']);
  if (!supportedTypes.has(messageType)) {
    res.status(400).json({ error: 'Unsupported message type.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }
  const myId = String(req.user._id);
  if (![String(connection.participantA), String(connection.participantB)].includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const otherUserId = String(connection.participantA) === myId ? String(connection.participantB) : String(connection.participantA);
  const blockedByUserIds = Array.isArray(connection.blockedByUserIds)
    ? connection.blockedByUserIds.map((entry) => String(entry))
    : [];
  if (blockedByUserIds.includes(myId) || blockedByUserIds.includes(otherUserId)) {
    res.status(403).json({ error: 'Messaging is blocked for this connection until unblocked.' });
    return;
  }

  if (text.length > 2000) {
    res.status(400).json({ error: 'Message is too long.' });
    return;
  }

  let attachment = null;
  let voiceMeta = null;
  let callInvite = null;

  try {
    if (messageType === 'file') {
      attachment = normalizeChatAttachment(req.body?.attachment, { allowAudio: false });
      if (!attachment) {
        res.status(400).json({ error: 'Attachment is required for file message.' });
        return;
      }
    }

    if (messageType === 'voice') {
      attachment = normalizeChatAttachment(req.body?.attachment, { allowAudio: true });
      if (!attachment || !String(attachment.mimeType || '').startsWith('audio/')) {
        res.status(400).json({ error: 'Voice note must be an audio file.' });
        return;
      }
      voiceMeta = {
        durationSeconds: clamp(Number(req.body?.voiceMeta?.durationSeconds || 0), 0, 7200),
      };
    }

    if (messageType === 'call-invite') {
      const mode = String(req.body?.callInvite?.mode || '').trim().toLowerCase();
      const roomUrl = String(req.body?.callInvite?.roomUrl || '').trim();
      const roomCode = String(req.body?.callInvite?.roomCode || '').trim();
      if (!['audio', 'video'].includes(mode) || !roomUrl) {
        res.status(400).json({ error: 'Valid call invite payload is required.' });
        return;
      }
      callInvite = { mode, roomUrl, roomCode };
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid message payload.' });
    return;
  }

  if (messageType === 'text' && !text) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }

  const created = await CommunityMessageModel.create({
    connectionId,
    senderUserId: req.user._id,
    messageType,
    text,
    attachment,
    voiceMeta,
    callInvite,
    readByUserIds: [req.user._id],
  });

  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: {
      type: 'community.message.sent',
      connectionId,
      senderUserId: String(req.user._id),
      recipientUserId: otherUserId,
    },
  });

  res.status(201).json({
    message: serializeCommunityMessage(created),
  });
});

app.post('/api/community/messages/:messageId/reactions', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const messageId = String(req.params.messageId || '').trim();
  const emoji = String(req.body?.emoji || '').trim();
  if (!isValidObjectId(messageId)) {
    res.status(400).json({ error: 'Valid message id is required.' });
    return;
  }
  if (!emoji) {
    res.status(400).json({ error: 'Emoji is required.' });
    return;
  }

  const message = await CommunityMessageModel.findById(messageId);
  if (!message) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(message.connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }

  const myId = String(req.user._id);
  const participants = [String(connection.participantA), String(connection.participantB)];
  if (!participants.includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const existingReactions = Array.isArray(message.reactions) ? message.reactions : [];
  const existingIndex = existingReactions.findIndex((item) => String(item?.userId || '') === myId);

  if (existingIndex >= 0 && String(existingReactions[existingIndex]?.emoji || '') === emoji) {
    existingReactions.splice(existingIndex, 1);
  } else if (existingIndex >= 0) {
    existingReactions[existingIndex].emoji = emoji;
    existingReactions[existingIndex].reactedAt = new Date();
  } else {
    existingReactions.push({
      userId: req.user._id,
      emoji,
      reactedAt: new Date(),
    });
  }

  message.reactions = existingReactions;
  await message.save();

  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: {
      type: 'community.message.reacted',
      connectionId: String(message.connectionId),
      messageId,
    },
  });

  res.json({ message: serializeCommunityMessage(message) });
});

app.post('/api/community/report', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const connectionId = String(req.body?.connectionId || '').trim();
  const reportedUserId = String(req.body?.reportedUserId || '').trim();
  const reason = String(req.body?.reason || '').trim();

  if (!isValidObjectId(connectionId) || !isValidObjectId(reportedUserId)) {
    res.status(400).json({ error: 'Valid connection id and reported user id are required.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }
  const myId = String(req.user._id);
  if (![String(connection.participantA), String(connection.participantB)].includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const messages = await CommunityMessageModel.find({ connectionId })
    .select('senderUserId text createdAt')
    .sort({ createdAt: 1 })
    .limit(300)
    .lean();
  const moderation = moderateCommunityConversation(messages);
  const snapshot = messages.map((item) => ({
    senderUserId: String(item.senderUserId),
    text: String(item.text || ''),
    createdAt: item.createdAt || null,
  }));

  const report = await CommunityReportModel.create({
    connectionId,
    reporterUserId: req.user._id,
    reportedUserId,
    reason,
    status: moderation.result === 'harmful' ? 'actioned' : 'open',
    moderation: {
      result: moderation.result,
      reasons: moderation.reasons,
      score: moderation.score,
      violatorUserId: moderation.violatorUserId,
      autoBlocked: moderation.result === 'harmful',
      reviewedAt: moderation.result === 'harmful' ? new Date() : null,
    },
    chatSnapshot: snapshot,
  });

  let enforcement = null;
  if (moderation.result === 'harmful' && moderation.violatorUserId) {
    const warnings = await applyCommunityViolation(
      moderation.violatorUserId,
      moderation.reasons.join(' ') || 'Harmful community behavior detected.',
      String(report._id),
    );
    const state = await getCommunityRestriction(moderation.violatorUserId);
    enforcement = {
      warningCount: warnings,
      action: state.action,
      mutedUntil: state.mutedUntil || null,
      bannedUntil: state.bannedUntil || null,
    };
  }

  res.status(201).json({
    ok: true,
    reportId: String(report._id),
    moderation: {
      result: moderation.result,
      reasons: moderation.reasons,
      score: moderation.score,
    },
    enforcement,
  });
});

app.get('/api/community/leaderboard', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const period = String(req.query.period || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
  const { start } = getPeriodBounds(period);
  const attempts = await AttemptModel.find({ attemptedAt: { $gte: start } }).lean();
  const previousWindowStart = new Date(start);
  previousWindowStart.setTime(start.getTime() - (period === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000);
  const previousAttempts = await AttemptModel.find({ attemptedAt: { $gte: previousWindowStart, $lt: start } }).lean();

  const periodStats = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.userId);
    const row = periodStats.get(key) || {
      userId: key,
      tests: 0,
      scoreSum: 0,
      correctSum: 0,
      totalQuestions: 0,
    };
    row.tests += 1;
    row.scoreSum += Number(attempt.score || 0);
    row.correctSum += Number(attempt.correctAnswers || 0);
    row.totalQuestions += Number(attempt.totalQuestions || 0);
    periodStats.set(key, row);
  }

  const previousStats = new Map();
  for (const attempt of previousAttempts) {
    const key = String(attempt.userId);
    const row = previousStats.get(key) || { tests: 0, scoreSum: 0 };
    row.tests += 1;
    row.scoreSum += Number(attempt.score || 0);
    previousStats.set(key, row);
  }

  const userIds = Array.from(periodStats.keys());
  const users = await UserModel.find({ _id: { $in: userIds } }).lean();
  const profiles = await CommunityProfileModel.find({ userId: { $in: userIds } }).lean();
  const userById = new Map(users.map((item) => [String(item._id), item]));
  const profileById = new Map(profiles.map((item) => [String(item.userId), item]));

  const leaderboard = Array.from(periodStats.values())
    .map((stats) => {
      const user = userById.get(stats.userId);
      if (!user) return null;
      const profile = profileById.get(stats.userId);
      const averageScore = stats.tests ? (stats.scoreSum / stats.tests) : 0;
      const accuracy = stats.totalQuestions ? (stats.correctSum / stats.totalQuestions) * 100 : 0;
      const prev = previousStats.get(stats.userId);
      const previousAverage = prev?.tests ? (prev.scoreSum / prev.tests) : averageScore;
      const improvement = averageScore - previousAverage;
      const competitionScore = (averageScore * 0.55) + (accuracy * 0.25) + (Math.max(0, improvement) * 0.2);

      return {
        ...serializeCommunityUser({ user, profile }),
        averageScore: Number(averageScore.toFixed(1)),
        tests: stats.tests,
        accuracy: Number(accuracy.toFixed(1)),
        improvement: Number(improvement.toFixed(1)),
        competitionScore,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.competitionScore - a.competitionScore)
    .slice(0, 20)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  res.json({ leaderboard, period });
});

app.post('/api/community/quiz-challenges', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  try {
    const currentUser = await UserModel.findById(req.user._id).lean();
    if (!currentUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const {
      opponentUserId,
      mode,
      challengeType,
      subject = '',
      topic = '',
      difficulty = 'Medium',
      questionCount = 15,
      durationSeconds = 900,
    } = req.body || {};

    const normalizedMode = normalizeChallengeMode(mode);
    if (!normalizedMode) {
      res.status(400).json({ error: 'Invalid challenge mode.' });
      return;
    }
    const normalizedChallengeType = normalizeChallengeType(challengeType);

    const opponentId = String(opponentUserId || '').trim();
    if (!isValidObjectId(opponentId)) {
      res.status(400).json({ error: 'Valid opponent user id is required.' });
      return;
    }

    if (opponentId === String(currentUser._id)) {
      res.status(400).json({ error: 'You cannot challenge yourself.' });
      return;
    }

    const opponentUser = await UserModel.findById(opponentId).lean();
    if (!opponentUser || opponentUser.role !== 'student') {
      res.status(404).json({ error: 'Opponent not found.' });
      return;
    }

    const connected = await CommunityConnectionModel.findOne({
      participantKey: connectionKey(currentUser._id, opponentUser._id),
    }).lean();

    const inFlight = await CommunityQuizChallengeModel.findOne({
      status: { $in: ['pending', 'accepted', 'in_progress'] },
      $or: [
        { challengerUserId: currentUser._id, opponentUserId: opponentUser._id },
        { challengerUserId: opponentUser._id, opponentUserId: currentUser._id },
      ],
    }).lean();
    if (inFlight) {
      res.status(409).json({ error: 'An in-flight challenge already exists for this connection.' });
      return;
    }

    const normalizedSubject = normalizeChallengeSubject(subject);
    if (normalizedMode === 'subject-wise' && !normalizedSubject) {
      res.status(400).json({ error: 'Please select a valid subject for subject-wise challenge.' });
      return;
    }

    const finalQuestionCount = clamp(Number(questionCount) || 15, 5, 40);
    const finalDuration = clamp(Number(durationSeconds) || 900, 120, 3600);

    const questions = await generateQuizChallengeQuestions({
      mode: normalizedMode,
      subject: normalizedSubject,
      topic,
      difficulty,
      questionCount: finalQuestionCount,
      challengerUser: currentUser,
      opponentUser,
    });

    const challenge = await CommunityQuizChallengeModel.create({
      connectionId: connected?._id || null,
      challengerUserId: currentUser._id,
      opponentUserId: opponentUser._id,
      mode: normalizedMode,
      challengeType: normalizedChallengeType,
      subject: normalizedSubject,
      topic: String(topic || '').trim(),
      difficulty: normalizeChallengeDifficulty(difficulty),
      questionCount: questions.length,
      durationSeconds: finalDuration,
      status: 'pending',
      invitedAt: new Date(),
      acceptedDeadlineAt: new Date(Date.now() + (48 * 60 * 60 * 1000)),
      questions,
      challengerLiveProgress: {},
      opponentLiveProgress: {},
      challengerResult: {
        userId: currentUser._id,
        submitted: false,
      },
      opponentResult: {
        userId: opponentUser._id,
        submitted: false,
      },
    });

    const challengerProfile = await getOrCreateCommunityProfile(currentUser);
    const challengerStats = ensureQuizStats(challengerProfile);
    challengerStats.totalChallengesSent += 1;
    challengerProfile.quizStats = challengerStats;
    await challengerProfile.save();

    broadcastSyncEvent({
      role: 'all',
      event: 'sync',
      data: {
        type: 'community.quiz.challenge.created',
        challengeId: String(challenge._id),
        challengerUserId: String(currentUser._id),
        opponentUserId: String(opponentUser._id),
        challengeType: normalizedChallengeType,
      },
    });

    const loaded = await CommunityQuizChallengeModel.findById(challenge._id).lean();
    res.status(201).json({ challenge: serializeQuizChallenge(loaded, req.user._id) });
  } catch (error) {
    console.error('community quiz challenge create error', error);
    res.status(500).json({ error: 'Failed to create quiz challenge.' });
  }
});

app.post('/api/community/quiz-challenges/:id/respond', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  try {
    const challengeId = String(req.params.id || '').trim();
    if (!isValidObjectId(challengeId)) {
      res.status(400).json({ error: 'Valid challenge id is required.' });
      return;
    }

    const challenge = await CommunityQuizChallengeModel.findById(challengeId);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found.' });
      return;
    }

    if (String(challenge.opponentUserId) !== String(req.user._id)) {
      res.status(403).json({ error: 'Only the challenged user can respond.' });
      return;
    }

    if (String(challenge.status) !== 'pending') {
      res.status(409).json({ error: 'Challenge is already responded.' });
      return;
    }

    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['accept', 'decline'].includes(action)) {
      res.status(400).json({ error: 'Action must be accept or decline.' });
      return;
    }

    if (action === 'decline') {
      challenge.status = 'declined';
      challenge.endedAt = new Date();
      await challenge.save();
      broadcastSyncEvent({
        role: 'all',
        event: 'sync',
        data: {
          type: 'community.quiz.challenge.responded',
          challengeId: String(challenge._id),
          action,
          status: String(challenge.status || ''),
        },
      });
      res.json({ challenge: serializeQuizChallenge(challenge.toObject(), req.user._id) });
      return;
    }

    challenge.status = normalizeChallengeType(challenge.challengeType) === 'live' ? 'in_progress' : 'accepted';
    challenge.acceptedAt = new Date();
    if (normalizeChallengeType(challenge.challengeType) === 'live') {
      challenge.startedAt = new Date();
    }
    await challenge.save();

    const user = await UserModel.findById(req.user._id).lean();
    if (user) {
      const profile = await getOrCreateCommunityProfile(user);
      const stats = ensureQuizStats(profile);
      stats.totalChallengesAccepted += 1;
      profile.quizStats = stats;
      await profile.save();
    }

    broadcastSyncEvent({
      role: 'all',
      event: 'sync',
      data: {
        type: 'community.quiz.challenge.responded',
        challengeId: String(challenge._id),
        action,
        status: String(challenge.status || ''),
      },
    });

    res.json({ challenge: serializeQuizChallenge(challenge.toObject(), req.user._id) });
  } catch (error) {
    console.error('community quiz challenge respond error', error);
    res.status(500).json({ error: 'Failed to respond to challenge.' });
  }
});

app.get('/api/community/quiz-challenges', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  try {
    const status = String(req.query.status || '').trim().toLowerCase();
    const filter = {
      $or: [{ challengerUserId: req.user._id }, { opponentUserId: req.user._id }],
    };
    if (['pending', 'accepted', 'in_progress', 'completed', 'declined', 'cancelled', 'expired'].includes(status)) {
      filter.status = status;
    }

    const challenges = await CommunityQuizChallengeModel.find(filter)
      .sort({ updatedAt: -1 })
      .limit(120)
      .lean();

    res.json({
      challenges: challenges.map((item) => serializeQuizChallenge(item, req.user._id)),
    });
  } catch (error) {
    console.error('community quiz challenge list error', error);
    res.status(500).json({ error: 'Failed to load challenges.' });
  }
});

app.get('/api/community/quiz-challenges/:id', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  try {
    const challengeId = String(req.params.id || '').trim();
    if (!isValidObjectId(challengeId)) {
      res.status(400).json({ error: 'Valid challenge id is required.' });
      return;
    }

    const challenge = await CommunityQuizChallengeModel.findById(challengeId).lean();
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found.' });
      return;
    }

    const viewerId = String(req.user._id);
    if (![String(challenge.challengerUserId), String(challenge.opponentUserId)].includes(viewerId)) {
      res.status(403).json({ error: 'You cannot view this challenge.' });
      return;
    }

    res.json({ challenge: serializeQuizChallenge(challenge, req.user._id) });
  } catch (error) {
    console.error('community quiz challenge detail error', error);
    res.status(500).json({ error: 'Failed to load challenge.' });
  }
});

app.post('/api/community/quiz-challenges/:id/submit', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  try {
    const challengeId = String(req.params.id || '').trim();
    if (!isValidObjectId(challengeId)) {
      res.status(400).json({ error: 'Valid challenge id is required.' });
      return;
    }

    const challenge = await CommunityQuizChallengeModel.findById(challengeId);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found.' });
      return;
    }

    const me = String(req.user._id);
    const isChallenger = String(challenge.challengerUserId) === me;
    const isOpponent = String(challenge.opponentUserId) === me;
    if (!isChallenger && !isOpponent) {
      res.status(403).json({ error: 'You cannot submit this challenge.' });
      return;
    }

    if (!['in_progress', 'accepted'].includes(String(challenge.status))) {
      res.status(409).json({ error: 'Challenge is not active.' });
      return;
    }

    const challengeType = normalizeChallengeType(challenge.challengeType);
    if (challengeType === 'live') {
      const startedAtMs = challenge.startedAt ? new Date(challenge.startedAt).getTime() : Date.now();
      const expiryMs = startedAtMs + (Number(challenge.durationSeconds || 0) * 1000);
      if (Date.now() > expiryMs) {
        challenge.status = 'expired';
        challenge.endedAt = new Date();
        await challenge.save();
        res.status(410).json({ error: 'Challenge time has expired.' });
        return;
      }
    }

    if (challengeType === 'async' && challenge.acceptedDeadlineAt && Date.now() > new Date(challenge.acceptedDeadlineAt).getTime()) {
      challenge.status = 'expired';
      challenge.endedAt = new Date();
      await challenge.save();
      res.status(410).json({ error: 'Async challenge expired before completion.' });
      return;
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const elapsedSeconds = Number(req.body?.elapsedSeconds || 0);
    const currentResult = isChallenger ? challenge.challengerResult : challenge.opponentResult;
    const effectiveAnswers = challengeType === 'live'
      ? (Array.isArray(currentResult?.answers) ? currentResult.answers : [])
      : answers;
    const scored = scoreQuizChallengeSubmission(challenge, effectiveAnswers, elapsedSeconds);

    if (challengeType === 'async' && !challenge.startedAt) {
      challenge.startedAt = new Date();
    }

    const baseResult = {
      submitted: true,
      completedAt: new Date(),
      elapsedSeconds: scored.safeElapsed,
      answers: scored.answerRows,
      correctCount: scored.correctCount,
      wrongCount: scored.wrongCount,
      unansweredCount: scored.unansweredCount,
      accuracyScore: scored.accuracyScore,
      speedScore: scored.speedScore,
      totalScore: scored.totalScore,
    };

    if (isChallenger) {
      challenge.challengerResult = {
        ...(challenge.challengerResult?.toObject ? challenge.challengerResult.toObject() : challenge.challengerResult),
        ...baseResult,
      };
    } else {
      challenge.opponentResult = {
        ...(challenge.opponentResult?.toObject ? challenge.opponentResult.toObject() : challenge.opponentResult),
        ...baseResult,
      };
    }

    const challengerSubmitted = Boolean(challenge.challengerResult?.submitted);
    const opponentSubmitted = Boolean(challenge.opponentResult?.submitted);
    if (challengerSubmitted && opponentSubmitted) {
      const challengerScore = Number(challenge.challengerResult?.totalScore || 0);
      const opponentScore = Number(challenge.opponentResult?.totalScore || 0);
      if (challengerScore > opponentScore) {
        challenge.winnerUserId = challenge.challengerUserId;
      } else if (opponentScore > challengerScore) {
        challenge.winnerUserId = challenge.opponentUserId;
      } else {
        const challengerElapsed = Number(challenge.challengerResult?.elapsedSeconds || 0);
        const opponentElapsed = Number(challenge.opponentResult?.elapsedSeconds || 0);
        if (challengerElapsed < opponentElapsed) {
          challenge.winnerUserId = challenge.challengerUserId;
        } else if (opponentElapsed < challengerElapsed) {
          challenge.winnerUserId = challenge.opponentUserId;
        } else {
          challenge.winnerUserId = null;
        }
      }
      challenge.status = 'completed';
      challenge.endedAt = new Date();
    } else {
      challenge.status = 'in_progress';
    }

    await challenge.save();
    if (String(challenge.status) === 'completed') {
      await applyQuizStatsToProfiles(challenge);
    }

    broadcastSyncEvent({
      role: 'all',
      event: 'sync',
      data: {
        type: 'community.quiz.challenge.submitted',
        challengeId: String(challenge._id),
        status: String(challenge.status || ''),
      },
    });

    const loaded = await CommunityQuizChallengeModel.findById(challenge._id).lean();
    res.json({ challenge: serializeQuizChallenge(loaded, req.user._id) });
  } catch (error) {
    console.error('community quiz challenge submit error', error);
    res.status(500).json({ error: 'Failed to submit challenge.' });
  }
});

app.post('/api/community/quiz-challenges/:id/progress', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  try {
    const challengeId = String(req.params.id || '').trim();
    if (!isValidObjectId(challengeId)) {
      res.status(400).json({ error: 'Valid challenge id is required.' });
      return;
    }

    const challenge = await CommunityQuizChallengeModel.findById(challengeId);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found.' });
      return;
    }

    if (normalizeChallengeType(challenge.challengeType) !== 'live') {
      res.status(409).json({ error: 'Progress updates are only supported for live challenges.' });
      return;
    }

    const me = String(req.user._id);
    const isChallenger = String(challenge.challengerUserId) === me;
    const isOpponent = String(challenge.opponentUserId) === me;
    if (!isChallenger && !isOpponent) {
      res.status(403).json({ error: 'You cannot update this challenge.' });
      return;
    }

    if (String(challenge.status) !== 'in_progress') {
      res.status(409).json({ error: 'Live challenge is not currently in progress.' });
      return;
    }

    const startedAtMs = challenge.startedAt ? new Date(challenge.startedAt).getTime() : Date.now();
    const expiryMs = startedAtMs + (Number(challenge.durationSeconds || 0) * 1000);
    if (Date.now() > expiryMs) {
      challenge.status = 'expired';
      challenge.endedAt = new Date();
      await challenge.save();
      res.status(410).json({ error: 'Challenge time has expired.' });
      return;
    }

    const resultKey = isChallenger ? 'challengerResult' : 'opponentResult';
    const progressKey = isChallenger ? 'challengerLiveProgress' : 'opponentLiveProgress';
    const currentResult = challenge[resultKey]?.toObject ? challenge[resultKey].toObject() : (challenge[resultKey] || {});
    if (Boolean(currentResult.submitted)) {
      res.status(409).json({ error: 'You already submitted this challenge.' });
      return;
    }

    const answers = Array.isArray(currentResult.answers)
      ? currentResult.answers.map((row) => ({
        questionId: String(row.questionId || ''),
        selectedOption: String(row.selectedOption || ''),
      }))
      : [];

    const questionId = String(req.body?.questionId || '').trim();
    const selectedOption = String(req.body?.selectedOption || '').trim();
    const elapsedSeconds = clamp(Number(req.body?.elapsedSeconds || 0), 0, Number(challenge.durationSeconds || 0));

    if (questionId) {
      const question = (challenge.questions || []).find((item) => String(item.questionId || '') === questionId);
      if (!question) {
        res.status(400).json({ error: 'Invalid question id for this challenge.' });
        return;
      }
      if (!selectedOption) {
        res.status(400).json({ error: 'selectedOption is required when questionId is provided.' });
        return;
      }
      const validOptions = Array.isArray(question.options) ? question.options.map((option) => String(option || '').trim()) : [];
      if (!validOptions.includes(selectedOption)) {
        res.status(400).json({ error: 'Selected option does not belong to this question.' });
        return;
      }
      const alreadyLocked = answers.some((row) => String(row.questionId || '') === questionId);
      if (!alreadyLocked) {
        answers.push({ questionId, selectedOption });
      }
    }

    const lockedProgress = computeLockedLiveProgress(challenge, answers, elapsedSeconds);
    challenge[resultKey] = {
      ...currentResult,
      answers,
      elapsedSeconds: lockedProgress.elapsedSeconds,
    };
    challenge[progressKey] = {
      ...(challenge[progressKey]?.toObject ? challenge[progressKey].toObject() : challenge[progressKey]),
      answeredCount: lockedProgress.answeredCount,
      correctCount: lockedProgress.correctCount,
      elapsedSeconds: lockedProgress.elapsedSeconds,
      updatedAt: new Date(),
    };

    await challenge.save();

    broadcastSyncEvent({
      role: 'all',
      event: 'sync',
      data: {
        type: 'community.quiz.challenge.progress',
        challengeId,
        userId: me,
        answeredCount: lockedProgress.answeredCount,
        correctCount: lockedProgress.correctCount,
      },
    });

    const loaded = await CommunityQuizChallengeModel.findById(challenge._id).lean();
    res.json({ challenge: serializeQuizChallenge(loaded, req.user._id) });
  } catch (error) {
    console.error('community quiz challenge progress error', error);
    res.status(500).json({ error: 'Failed to update challenge progress.' });
  }
});

app.post('/api/community/quiz-challenges/:id/forfeit', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  try {
    const challengeId = String(req.params.id || '').trim();
    if (!isValidObjectId(challengeId)) {
      res.status(400).json({ error: 'Valid challenge id is required.' });
      return;
    }

    const challenge = await CommunityQuizChallengeModel.findById(challengeId);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found.' });
      return;
    }

    const me = String(req.user._id);
    const challengerId = String(challenge.challengerUserId);
    const opponentId = String(challenge.opponentUserId);
    if (me !== challengerId && me !== opponentId) {
      res.status(403).json({ error: 'You cannot forfeit this challenge.' });
      return;
    }

    if (['completed', 'cancelled', 'declined', 'expired'].includes(String(challenge.status || ''))) {
      const loadedFinal = await CommunityQuizChallengeModel.findById(challenge._id).lean();
      res.json({ challenge: serializeQuizChallenge(loadedFinal, req.user._id) });
      return;
    }

    const winnerId = me === challengerId ? challenge.opponentUserId : challenge.challengerUserId;
    const loserResultKey = me === challengerId ? 'challengerResult' : 'opponentResult';
    const winnerResultKey = me === challengerId ? 'opponentResult' : 'challengerResult';

    const loserResult = challenge[loserResultKey]?.toObject ? challenge[loserResultKey].toObject() : (challenge[loserResultKey] || {});
    const winnerResult = challenge[winnerResultKey]?.toObject ? challenge[winnerResultKey].toObject() : (challenge[winnerResultKey] || {});

    challenge[loserResultKey] = {
      ...loserResult,
      submitted: true,
      completedAt: new Date(),
      totalScore: Number(loserResult.totalScore || 0),
    };

    challenge[winnerResultKey] = {
      ...winnerResult,
      submitted: true,
      completedAt: winnerResult.completedAt || new Date(),
      totalScore: Number(winnerResult.totalScore || 0),
    };

    challenge.winnerUserId = winnerId;
    challenge.status = 'cancelled';
    if (!challenge.startedAt) {
      challenge.startedAt = new Date();
    }
    challenge.endedAt = new Date();
    await challenge.save();
    await applyQuizStatsToProfiles(challenge);

    broadcastSyncEvent({
      role: 'all',
      event: 'sync',
      data: {
        type: 'community.quiz.challenge.cancelled',
        challengeId: String(challenge._id),
        loserUserId: me,
        winnerUserId: String(winnerId),
      },
    });

    const loaded = await CommunityQuizChallengeModel.findById(challenge._id).lean();
    res.json({ challenge: serializeQuizChallenge(loaded, req.user._id) });
  } catch (error) {
    console.error('community quiz challenge forfeit error', error);
    res.status(500).json({ error: 'Failed to forfeit challenge.' });
  }
});

app.get('/api/community/quiz-leaderboard', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  try {
    const profiles = await CommunityProfileModel.find({})
      .select('userId username name avatar quizStats')
      .sort({ 'quizStats.totalWins': -1, 'quizStats.totalMatchesPlayed': -1 })
      .limit(100)
      .lean();

    const leaderboard = profiles
      .map((profile) => {
        const stats = formatQuizStatsForPublic(profile);
        return {
          userId: String(profile.userId || ''),
          username: String(profile.username || ''),
          name: String(profile.name || ''),
          avatar: profile.avatar || null,
          ...stats,
        };
      })
      .filter((row) => row.totalMatchesPlayed > 0)
      .sort((a, b) => {
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.totalMatchesPlayed - a.totalMatchesPlayed;
      })
      .slice(0, 30)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('community quiz leaderboard error', error);
    res.status(500).json({ error: 'Failed to load quiz leaderboard.' });
  }
});

app.get('/api/community/groups', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const roomIds = COMMUNITY_ROOM_DEFINITIONS.map((room) => room.id);
  const counts = await CommunityRoomPostModel.aggregate([
    { $match: { roomId: { $in: roomIds } } },
    { $group: { _id: '$roomId', posts: { $sum: 1 } } },
  ]);
  const countByRoom = new Map(counts.map((row) => [String(row._id), Number(row.posts || 0)]));

  res.json({
    groups: COMMUNITY_ROOM_DEFINITIONS.map((room) => ({
      ...room,
      members: Math.max(8, Math.round(15 + (countByRoom.get(room.id) || 0) * 1.4)),
      posts: countByRoom.get(room.id) || 0,
      description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.',
    })),
  });
});

app.get('/api/community/discussion-rooms', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const roomIds = COMMUNITY_ROOM_DEFINITIONS.map((room) => room.id);
  const counts = await CommunityRoomPostModel.aggregate([
    { $match: { roomId: { $in: roomIds } } },
    { $group: { _id: '$roomId', posts: { $sum: 1 } } },
  ]);
  const countByRoom = new Map(counts.map((row) => [String(row._id), Number(row.posts || 0)]));

  res.json({
    rooms: COMMUNITY_ROOM_DEFINITIONS.map((room) => ({
      ...room,
      posts: countByRoom.get(room.id) || 0,
    })),
  });
});

app.get('/api/community/discussion-rooms/:roomId/posts', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 80, maxLimit: 180 });
  const roomId = String(req.params.roomId || '').trim();
  const room = COMMUNITY_ROOM_DEFINITIONS.find((item) => item.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Discussion room not found.' });
    return;
  }

  const posts = await CommunityRoomPostModel.find({ roomId })
    .select(COMMUNITY_ROOM_POST_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  const userIds = Array.from(new Set([
    ...posts.map((item) => String(item.authorUserId)),
    ...posts.flatMap((item) => (item.answers || []).map((answer) => String(answer.authorUserId))),
  ]));
  const [users, profiles] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } }).select(COMMUNITY_USER_SELECT).lean(),
    CommunityProfileModel.find({ userId: { $in: userIds } }).select(COMMUNITY_PROFILE_SELECT).lean(),
  ]);
  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const profilesById = new Map(profiles.map((item) => [String(item.userId), item]));

  const payload = posts.map((post) => {
    const author = usersById.get(String(post.authorUserId));
    const authorProfile = profilesById.get(String(post.authorUserId));
    return {
      id: String(post._id),
      roomId: post.roomId,
      type: String(post.type || 'discussion'),
      title: String(post.title || ''),
      text: String(post.text || ''),
      subject: String(post.subject || room.subject || ''),
      upvotes: Number(post.upvotes || 0),
      createdAt: post.createdAt ? new Date(post.createdAt).toISOString() : null,
      author: author ? serializeCommunityUser({ user: author, profile: authorProfile }) : null,
      answers: Array.isArray(post.answers) ? post.answers.map((answer) => {
        const answerAuthor = usersById.get(String(answer.authorUserId));
        const answerProfile = profilesById.get(String(answer.authorUserId));
        return {
          id: String(answer._id),
          text: String(answer.text || ''),
          upvotes: Number(answer.upvotes || 0),
          createdAt: answer.createdAt ? new Date(answer.createdAt).toISOString() : null,
          author: answerAuthor ? serializeCommunityUser({ user: answerAuthor, profile: answerProfile }) : null,
        };
      }) : [],
    };
  });

  res.json({ room, page, limit, posts: payload });
});

app.post('/api/community/discussion-rooms/:roomId/posts', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const roomId = String(req.params.roomId || '').trim();
  const room = COMMUNITY_ROOM_DEFINITIONS.find((item) => item.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Discussion room not found.' });
    return;
  }

  const type = String(req.body?.type || 'discussion').trim().toLowerCase() === 'doubt' ? 'doubt' : 'discussion';
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const text = String(req.body?.text || '').trim().slice(0, 2500);
  const subject = String(req.body?.subject || room.subject || '').trim().toLowerCase();
  if (!text) {
    res.status(400).json({ error: 'Post text is required.' });
    return;
  }

  const moderation = moderateCommunityConversation([{ senderUserId: req.user._id, text }]);
  if (moderation.result === 'harmful') {
    const warnings = await applyCommunityViolation(req.user._id, moderation.reasons.join(' ') || 'Policy violation in discussion post.');
    const state = await getCommunityRestriction(req.user._id);
    res.status(403).json({
      error: 'Your message violates community rules and could not be posted.',
      code: 'COMMUNITY_POLICY_BLOCK',
      moderation,
      enforcement: {
        warningCount: warnings,
        action: state.action,
        mutedUntil: state.mutedUntil || null,
        bannedUntil: state.bannedUntil || null,
      },
    });
    return;
  }

  const created = await CommunityRoomPostModel.create({
    roomId,
    authorUserId: req.user._id,
    type,
    title,
    text,
    subject,
  });

  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: { type: 'community.discussion.updated', roomId, postId: String(created._id), action: 'post' },
  });

  res.status(201).json({ postId: String(created._id) });
});

app.post('/api/community/discussion-posts/:postId/answers', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const postId = String(req.params.postId || '').trim();
  if (!isValidObjectId(postId)) {
    res.status(400).json({ error: 'Valid post id is required.' });
    return;
  }
  const text = String(req.body?.text || '').trim().slice(0, 1800);
  if (!text) {
    res.status(400).json({ error: 'Answer text is required.' });
    return;
  }

  const moderation = moderateCommunityConversation([{ senderUserId: req.user._id, text }]);
  if (moderation.result === 'harmful') {
    const warnings = await applyCommunityViolation(req.user._id, moderation.reasons.join(' ') || 'Policy violation in doubt answer.');
    const state = await getCommunityRestriction(req.user._id);
    res.status(403).json({
      error: 'Your answer violates community rules and could not be posted.',
      code: 'COMMUNITY_POLICY_BLOCK',
      moderation,
      enforcement: {
        warningCount: warnings,
        action: state.action,
        mutedUntil: state.mutedUntil || null,
        bannedUntil: state.bannedUntil || null,
      },
    });
    return;
  }

  const post = await CommunityRoomPostModel.findById(postId);
  if (!post) {
    res.status(404).json({ error: 'Discussion post not found.' });
    return;
  }

  post.answers.push({
    authorUserId: req.user._id,
    text,
    upvotes: 0,
    upvotedByUserIds: [],
  });
  await post.save();

  const answer = post.answers[post.answers.length - 1];
  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: { type: 'community.discussion.updated', roomId: String(post.roomId || ''), postId, answerId: String(answer._id), action: 'answer' },
  });
  res.status(201).json({ answerId: String(answer._id) });
});

app.post('/api/community/discussion-posts/:postId/upvote', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const postId = String(req.params.postId || '').trim();
  if (!isValidObjectId(postId)) {
    res.status(400).json({ error: 'Valid post id is required.' });
    return;
  }

  const targetType = String(req.body?.targetType || 'post').trim().toLowerCase();
  const answerId = String(req.body?.answerId || '').trim();
  const post = await CommunityRoomPostModel.findById(postId);
  if (!post) {
    res.status(404).json({ error: 'Discussion post not found.' });
    return;
  }

  if (targetType === 'answer') {
    const answer = post.answers.id(answerId);
    if (!answer) {
      res.status(404).json({ error: 'Answer not found.' });
      return;
    }
    const voted = answer.upvotedByUserIds.some((item) => String(item) === String(req.user._id));
    if (voted) {
      answer.upvotedByUserIds = answer.upvotedByUserIds.filter((item) => String(item) !== String(req.user._id));
      answer.upvotes = Math.max(0, Number(answer.upvotes || 0) - 1);
    } else {
      answer.upvotedByUserIds.push(req.user._id);
      answer.upvotes = Number(answer.upvotes || 0) + 1;
    }
    await post.save();
    broadcastSyncEvent({
      role: 'all',
      event: 'sync',
      data: { type: 'community.discussion.updated', roomId: String(post.roomId || ''), postId, answerId, action: 'upvote-answer' },
    });
    res.json({ ok: true, targetType: 'answer', upvotes: Number(answer.upvotes || 0) });
    return;
  }

  const voted = post.upvotedByUserIds.some((item) => String(item) === String(req.user._id));
  if (voted) {
    post.upvotedByUserIds = post.upvotedByUserIds.filter((item) => String(item) !== String(req.user._id));
    post.upvotes = Math.max(0, Number(post.upvotes || 0) - 1);
  } else {
    post.upvotedByUserIds.push(req.user._id);
    post.upvotes = Number(post.upvotes || 0) + 1;
  }
  await post.save();
  broadcastSyncEvent({
    role: 'all',
    event: 'sync',
    data: { type: 'community.discussion.updated', roomId: String(post.roomId || ''), postId, action: 'upvote-post' },
  });
  res.json({ ok: true, targetType: 'post', upvotes: Number(post.upvotes || 0) });
});

app.get('/api/community/achievements', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;

  const me = await UserModel.findById(req.user._id).lean();
  if (!me) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).limit(300).lean();
  const physicsAttempts = attempts.filter((item) => String(item.subject || '').toLowerCase() === 'physics');
  const physicsAverage = physicsAttempts.length
    ? physicsAttempts.reduce((sum, item) => sum + Number(item.score || 0), 0) / physicsAttempts.length
    : 0;

  const weeklyBoard = await (async () => {
    const { start } = getPeriodBounds('weekly');
    const rows = await AttemptModel.find({ attemptedAt: { $gte: start } }).lean();
    const scoreMap = new Map();
    for (const row of rows) {
      const key = String(row.userId);
      const bucket = scoreMap.get(key) || { scoreSum: 0, tests: 0 };
      bucket.scoreSum += Number(row.score || 0);
      bucket.tests += 1;
      scoreMap.set(key, bucket);
    }
    return Array.from(scoreMap.entries())
      .map(([userId, bucket]) => ({ userId, score: bucket.tests ? bucket.scoreSum / bucket.tests : 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  })();
  const top10Ids = new Set(weeklyBoard.map((item) => String(item.userId)));

  const streak = longestRecentStreak(attempts.map((item) => item.attemptedAt));
  const solved = Number(me.progress?.questionsSolved || 0);
  const avg = Number(me.progress?.averageScore || 0);

  const myAnswers = await CommunityRoomPostModel.aggregate([
    { $unwind: '$answers' },
    { $match: { 'answers.authorUserId': req.user._id } },
    { $group: { _id: null, totalUpvotes: { $sum: '$answers.upvotes' }, answersCount: { $sum: 1 } } },
  ]);
  const answerStats = myAnswers[0] || { totalUpvotes: 0, answersCount: 0 };

  const badges = [
    { id: 'practice-master', label: 'Practice Master', icon: '📘', earned: solved >= 1000, progress: solved, target: 1000 },
    { id: 'accuracy-king', label: 'Accuracy King', icon: '🎯', earned: avg >= 90, progress: Number(avg.toFixed(1)), target: 90 },
    { id: 'physics-expert', label: 'Physics Expert', icon: '🧠', earned: physicsAttempts.length >= 5 && physicsAverage >= 85, progress: Number(physicsAverage.toFixed(1)), target: 85 },
    { id: 'study-streak-7', label: '7-Day Study Streak', icon: '🔥', earned: streak >= 7, progress: streak, target: 7 },
    { id: 'leaderboard-top10', label: 'Top 10 Leaderboard', icon: '🏆', earned: top10Ids.has(String(req.user._id)), progress: top10Ids.has(String(req.user._id)) ? 10 : 0, target: 10 },
    { id: 'doubt-contributor', label: 'Contributor Badge', icon: '🏅', earned: Number(answerStats.totalUpvotes || 0) >= 10, progress: Number(answerStats.totalUpvotes || 0), target: 10 },
  ];

  res.json({
    badges,
    stats: {
      solved,
      averageScore: Number(avg.toFixed(1)),
      streak,
      contributorUpvotes: Number(answerStats.totalUpvotes || 0),
      contributorAnswers: Number(answerStats.answersCount || 0),
    },
  });
});

app.get('/api/community/study-partners', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const me = await UserModel.findById(req.user._id).select(COMMUNITY_USER_SELECT).lean();
  if (!me) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const profiles = await CommunityProfileModel.find().select(COMMUNITY_PROFILE_SELECT).limit(200).lean();
  const profileMap = new Map(profiles.map((item) => [String(item.userId), item]));
  const meProfile = profileMap.get(String(req.user._id)) || await getOrCreateCommunityProfile(req.user);
  const candidates = await UserModel.find({ _id: { $ne: req.user._id }, role: 'student' })
    .select(COMMUNITY_USER_SELECT)
    .limit(80)
    .lean();

  const candidateIds = candidates.map((item) => String(item._id));
  const participantKeys = candidateIds.map((id) => connectionKey(req.user._id, id));
  const [connections, pendingSentRows, pendingReceivedRows] = await Promise.all([
    CommunityConnectionModel.find({ participantKey: { $in: participantKeys } }).select('participantKey').lean(),
    CommunityConnectionRequestModel.find({
      fromUserId: req.user._id,
      toUserId: { $in: candidateIds },
      status: 'pending',
    }).select('toUserId').lean(),
    CommunityConnectionRequestModel.find({
      fromUserId: { $in: candidateIds },
      toUserId: req.user._id,
      status: 'pending',
    }).select('fromUserId').lean(),
  ]);

  const connectedKeys = new Set(connections.map((row) => String(row.participantKey)));
  const pendingSentTo = new Set(pendingSentRows.map((row) => String(row.toUserId)));
  const pendingReceivedFrom = new Set(pendingReceivedRows.map((row) => String(row.fromUserId)));

  const matches = candidates
    .map((item) => {
      const profile = profileMap.get(String(item._id));
      if (!profile) return null;
      const weakTopics = Array.isArray(item.progress?.weakTopics) ? item.progress.weakTopics.map((x) => String(x).toLowerCase()) : [];
      const meWeak = Array.isArray(me.progress?.weakTopics) ? me.progress.weakTopics.map((x) => String(x).toLowerCase()) : [];
      const overlap = meWeak.filter((topic) => weakTopics.includes(topic)).length;

      const meNeeds = normalizeSubjectList(meProfile.subjectsNeedHelp || []);
      const candidateNeeds = normalizeSubjectList(profile.subjectsNeedHelp || []);
      const subjectNeedOverlap = meNeeds.filter((topic) => candidateNeeds.includes(topic)).length;

      const netTypeMatch = String(meProfile.targetNetType || '') === String(profile.targetNetType || '') ? 18 : 0;
      const levelDistance = Math.abs(levelRank(normalizePreparationLevel(meProfile.preparationLevel)) - levelRank(normalizePreparationLevel(profile.preparationLevel)));
      const levelScore = levelDistance === 0 ? 12 : levelDistance === 1 ? 6 : 0;
      const timeMatch = normalizeStudyTimePreference(meProfile.studyTimePreference) === normalizeStudyTimePreference(profile.studyTimePreference) ? 12 : 4;

      const score = Number(item.progress?.averageScore || 0);
      const myScore = Number(me.progress?.averageScore || 0);
      const scoreGap = Math.abs(score - myScore);
      const scoreGapScore = Math.max(0, 22 - Math.round(scoreGap / 4));

      const requestedSubjectBonus = subject && (
        meNeeds.some((x) => x.includes(subject)) ||
        candidateNeeds.some((x) => x.includes(subject)) ||
        weakTopics.some((t) => t.includes(subject))
      ) ? 10 : 0;

      const rangeMin = Number(meProfile.testScoreRange?.min ?? 0);
      const rangeMax = Number(meProfile.testScoreRange?.max ?? 200);
      const rangeMatch = score >= rangeMin && score <= rangeMax ? 10 : 0;

      const compatibility = Math.max(0, Math.min(100,
        netTypeMatch
        + levelScore
        + timeMatch
        + scoreGapScore
        + overlap * 4
        + subjectNeedOverlap * 6
        + requestedSubjectBonus
        + rangeMatch
      ));

      return {
        compatibility,
        user: {
          ...serializeCommunityUser({ user: item, profile }),
          connectionStatus: connectedKeys.has(connectionKey(req.user._id, item._id))
            ? 'connected'
            : pendingSentTo.has(String(item._id))
              ? 'pending-sent'
              : pendingReceivedFrom.has(String(item._id))
                ? 'pending-received'
                : 'none',
        },
        reasons: [
          netTypeMatch ? 'Same NET type' : null,
          levelScore >= 6 ? 'Similar preparation level' : null,
          timeMatch >= 12 ? 'Same study time preference' : null,
          rangeMatch ? 'Within preferred score range' : null,
        ].filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.compatibility - a.compatibility)
    .slice(0, 12);

  res.json({ studyPartners: matches });
});

app.get('/api/support-chat/messages', authMiddleware, async (req, res) => {
  const userId = String(req.user._id);
  const messages = await SupportChatMessageModel.find({ userId })
    .sort({ createdAt: 1 })
    .limit(400)
    .lean();

  await SupportChatMessageModel.updateMany(
    {
      userId,
      senderRole: 'admin',
      readByUser: false,
    },
    { $set: { readByUser: true } },
  );

  const unreadFromAdmin = messages.reduce((count, item) => {
    if (item.senderRole === 'admin' && !item.readByUser) return count + 1;
    return count;
  }, 0);

  res.json({
    unreadFromAdmin,
    messages: messages.map((item) => serializeSupportMessage(item)),
  });
});

app.post('/api/support-chat/messages', authMiddleware, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const messageType = String(req.body?.messageType || 'text').trim().toLowerCase();
  if (!['text', 'file'].includes(messageType)) {
    res.status(400).json({ error: 'Support chat only allows text and file messages.' });
    return;
  }
  if (text.length > 1500) {
    res.status(400).json({ error: 'Message is too long.' });
    return;
  }

  let attachment = null;
  try {
    if (messageType === 'file') {
      attachment = normalizeChatAttachment(req.body?.attachment, { allowAudio: false });
      if (!attachment) {
        res.status(400).json({ error: 'Attachment is required for file message.' });
        return;
      }
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid attachment payload.' });
    return;
  }

  if (messageType === 'text' && !text) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }

  const created = await SupportChatMessageModel.create({
    userId: req.user._id,
    senderRole: 'user',
    senderUserId: req.user._id,
    messageType,
    text,
    attachment,
    readByUser: true,
    readByAdmin: false,
  });

  res.status(201).json({
    message: serializeSupportMessage(created),
  });
});

app.post('/api/support-chat/messages/:messageId/reactions', authMiddleware, async (req, res) => {
  const messageId = String(req.params.messageId || '').trim();
  const emoji = String(req.body?.emoji || '').trim();
  if (!isValidObjectId(messageId)) {
    res.status(400).json({ error: 'Valid message id is required.' });
    return;
  }
  if (!emoji) {
    res.status(400).json({ error: 'Emoji is required.' });
    return;
  }

  const message = await SupportChatMessageModel.findById(messageId);
  if (!message || String(message.userId) !== String(req.user._id)) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }

  const senderRole = req.user.role === 'admin' ? 'admin' : 'user';
  const existingReactions = Array.isArray(message.reactions) ? message.reactions : [];
  const existingIndex = existingReactions.findIndex((item) => (
    String(item?.senderRole || '') === senderRole
    && String(item?.senderUserId || '') === String(req.user._id)
  ));

  if (existingIndex >= 0 && String(existingReactions[existingIndex]?.emoji || '') === emoji) {
    existingReactions.splice(existingIndex, 1);
  } else if (existingIndex >= 0) {
    existingReactions[existingIndex].emoji = emoji;
    existingReactions[existingIndex].reactedAt = new Date();
  } else {
    existingReactions.push({
      senderRole,
      senderUserId: req.user._id,
      emoji,
      reactedAt: new Date(),
    });
  }

  message.reactions = existingReactions;
  await message.save();

  res.json({ message: serializeSupportMessage(message) });
});

app.get('/api/admin/community/reports', authMiddleware, requireAdmin, async (_req, res) => {
  const { page, limit, skip } = readPagination(_req.query, { defaultLimit: 100, maxLimit: 300 });
  const reports = await CommunityReportModel.find()
    .select('connectionId reporterUserId reportedUserId reason status moderation chatSnapshot createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({
    page,
    limit,
    reports: reports.map((item) => ({
      id: String(item._id),
      connectionId: String(item.connectionId),
      reporterUserId: String(item.reporterUserId),
      reportedUserId: String(item.reportedUserId),
      reason: String(item.reason || ''),
      status: String(item.status || 'open'),
      moderation: item.moderation || {},
      chatSnapshot: Array.isArray(item.chatSnapshot) ? item.chatSnapshot : [],
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    })),
  });
});

app.get('/api/admin/support-chat/conversations', authMiddleware, requireAdmin, async (_req, res) => {
  const recentMessages = await SupportChatMessageModel.find({})
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();

  const byUserId = new Map();
  for (const item of recentMessages) {
    const userId = String(item.userId);
    if (!byUserId.has(userId)) {
      byUserId.set(userId, {
        userId,
        lastMessageText: String(item.text || ''),
        lastMessageAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
        unreadForAdmin: 0,
      });
    }
    if (item.senderRole === 'user' && !item.readByAdmin) {
      byUserId.get(userId).unreadForAdmin += 1;
    }
  }

  const userIds = Array.from(byUserId.keys());
  const users = userIds.length
    ? await UserModel.find({ _id: { $in: userIds } }).select('firstName lastName email phone').lean()
    : [];
  const userMap = new Map(users.map((item) => [String(item._id), item]));

  const conversations = Array.from(byUserId.values())
    .map((entry) => {
      const user = userMap.get(entry.userId);
      return {
        userId: entry.userId,
        userName: user ? `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim() : 'Unknown User',
        email: user?.email || '',
        mobileNumber: user?.phone || '',
        lastMessageText: entry.lastMessageText,
        lastMessageAt: entry.lastMessageAt,
        unreadForAdmin: entry.unreadForAdmin,
      };
    })
    .sort((a, b) => new Date(String(b.lastMessageAt || 0)).getTime() - new Date(String(a.lastMessageAt || 0)).getTime());

  res.json({ conversations });
});

app.get('/api/admin/support-chat/messages/:userId', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!isValidObjectId(userId)) {
    res.status(400).json({ error: 'Valid user id is required.' });
    return;
  }

  const targetUser = await UserModel.findById(userId).select('firstName lastName email phone').lean();
  const messages = await SupportChatMessageModel.find({ userId })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  if (!targetUser && !messages.length) {
    res.status(404).json({ error: 'Support thread not found.' });
    return;
  }

  await SupportChatMessageModel.updateMany(
    {
      userId,
      senderRole: 'user',
      readByAdmin: false,
    },
    { $set: { readByAdmin: true } },
  );

  res.json({
    user: {
      id: targetUser ? String(targetUser._id) : userId,
      name: targetUser
        ? `${String(targetUser.firstName || '').trim()} ${String(targetUser.lastName || '').trim()}`.trim()
        : 'Deleted User',
      email: targetUser?.email || '',
      mobileNumber: targetUser?.phone || '',
      isDeleted: !targetUser,
    },
    messages: messages.map((item) => serializeSupportMessage(item)),
  });
});

app.post('/api/admin/support-chat/messages/:userId', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const text = String(req.body?.text || '').trim();
  const messageType = String(req.body?.messageType || 'text').trim().toLowerCase();

  if (!isValidObjectId(userId)) {
    res.status(400).json({ error: 'Valid user id is required.' });
    return;
  }
  if (!['text', 'file'].includes(messageType)) {
    res.status(400).json({ error: 'Support chat only allows text and file messages.' });
    return;
  }
  if (text.length > 1500) {
    res.status(400).json({ error: 'Message is too long.' });
    return;
  }

  const targetUser = await UserModel.findById(userId).lean();
  if (!targetUser) {
    res.status(410).json({ error: 'User account was deleted. This support thread is now read-only.' });
    return;
  }

  let attachment = null;
  try {
    if (messageType === 'file') {
      attachment = normalizeChatAttachment(req.body?.attachment, { allowAudio: false });
      if (!attachment) {
        res.status(400).json({ error: 'Attachment is required for file message.' });
        return;
      }
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid attachment payload.' });
    return;
  }

  if (messageType === 'text' && !text) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }

  const created = await SupportChatMessageModel.create({
    userId,
    senderRole: 'admin',
    senderUserId: req.user._id,
    messageType,
    text,
    attachment,
    readByUser: false,
    readByAdmin: true,
  });

  res.status(201).json({
    message: serializeSupportMessage(created),
  });
});

app.post('/api/admin/support-chat/messages/:userId/:messageId/reactions', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const messageId = String(req.params.messageId || '').trim();
  const emoji = String(req.body?.emoji || '').trim();

  if (!isValidObjectId(userId) || !isValidObjectId(messageId)) {
    res.status(400).json({ error: 'Valid user id and message id are required.' });
    return;
  }
  if (!emoji) {
    res.status(400).json({ error: 'Emoji is required.' });
    return;
  }

  const message = await SupportChatMessageModel.findById(messageId);
  if (!message || String(message.userId) !== userId) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }

  const existingReactions = Array.isArray(message.reactions) ? message.reactions : [];
  const existingIndex = existingReactions.findIndex((item) => (
    String(item?.senderRole || '') === 'admin'
    && String(item?.senderUserId || '') === String(req.user._id)
  ));

  if (existingIndex >= 0 && String(existingReactions[existingIndex]?.emoji || '') === emoji) {
    existingReactions.splice(existingIndex, 1);
  } else if (existingIndex >= 0) {
    existingReactions[existingIndex].emoji = emoji;
    existingReactions[existingIndex].reactedAt = new Date();
  } else {
    existingReactions.push({
      senderRole: 'admin',
      senderUserId: req.user._id,
      emoji,
      reactedAt: new Date(),
    });
  }

  message.reactions = existingReactions;
  await message.save();

  res.json({ message: serializeSupportMessage(message) });
});

app.post('/api/admin/community/reports/:reportId/review', authMiddleware, requireAdmin, async (req, res) => {
  const reportId = String(req.params.reportId || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  const violatorUserId = String(req.body?.violatorUserId || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (!isValidObjectId(reportId)) {
    res.status(400).json({ error: 'Valid report id is required.' });
    return;
  }
  if (!['block', 'dismiss'].includes(action)) {
    res.status(400).json({ error: 'action must be block or dismiss.' });
    return;
  }

  const report = await CommunityReportModel.findById(reportId);
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  if (action === 'dismiss') {
    report.status = 'dismissed';
    report.moderation.reviewedByEmail = req.user.email;
    report.moderation.reviewedAt = new Date();
    if (notes) {
      const reasons = Array.isArray(report.moderation.reasons) ? report.moderation.reasons : [];
      report.moderation.reasons = [...reasons, `Admin note: ${notes}`];
    }
    await report.save();
    res.json({ ok: true, status: report.status });
    return;
  }

  const targetUserId = violatorUserId || String(report.moderation?.violatorUserId || report.reportedUserId || '');
  if (!isValidObjectId(targetUserId)) {
    res.status(400).json({ error: 'A valid violator user id is required to block.' });
    return;
  }

  await CommunityBlockModel.findOneAndUpdate(
    { userId: targetUserId },
    {
      $set: {
        blocked: true,
        reason: notes || 'Blocked by admin after community report review.',
        sourceReportId: reportId,
        blockedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  report.status = 'actioned';
  report.moderation.result = 'harmful';
  report.moderation.violatorUserId = targetUserId;
  report.moderation.autoBlocked = true;
  report.moderation.reviewedByEmail = req.user.email;
  report.moderation.reviewedAt = new Date();
  if (notes) {
    const reasons = Array.isArray(report.moderation.reasons) ? report.moderation.reasons : [];
    report.moderation.reasons = [...reasons, `Admin note: ${notes}`];
  }
  await report.save();

  res.json({ ok: true, status: report.status });
});

app.get('/api/mcqs', async (req, res) => {
  try {
    const { subject, part, chapter, section, difficulty, topic } = req.query;
    const { page, limit, skip } = readPagination(req.query, { defaultLimit: 500, maxLimit: 2000 });
    const filter = {};

    if (subject) {
      filter.subject = String(subject).toLowerCase();
    }
    if (difficulty) {
      const normalized = String(difficulty).toLowerCase();
      const title = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      filter.difficulty = title;
    }
    if (part) {
      filter.part = String(part).toLowerCase().trim();
    }
    if (chapter) {
      const expr = containsRegex(chapter, 100);
      if (expr) filter.chapter = expr;
    }
    if (section) {
      const expr = containsRegex(section, 100);
      if (expr) filter.section = expr;
    }
    if (topic) {
      const expr = containsRegex(topic, 100);
      if (expr) filter.topic = expr;
    }

    const mcqs = await MCQModel.find(filter)
      .select(MCQ_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      page,
      limit,
      mcqs: mcqs.map((item) => serializeMcq(item)),
      total: mcqs.length,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load MCQs.' });
  }
});

app.post('/api/practice/analyze', authMiddleware, async (req, res) => {
  const questionText = String(req.body?.question || '').trim();
  const stepsRaw = String(req.body?.steps || '').trim();
  const subject = String(req.body?.subject || '').toLowerCase();

  if (!stepsRaw) {
    res.status(400).json({ error: 'Solution steps are required.' });
    return;
  }

  const steps = stepsRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const analysis = steps.map((step, index) => {
    const normalized = step.toLowerCase();
    const hasEquationToken = /[a-z0-9]/i.test(step) && /[=+\-*/]/.test(step);
    const maybeFinal = /(^|\s)x\s*=/.test(normalized) || normalized.includes('answer');

    const correct = hasEquationToken || maybeFinal;
    return {
      step: index + 1,
      correct,
      message: correct
        ? 'Step is structurally valid. Keep equations explicit for maximum accuracy.'
        : 'Step seems incomplete. Add the transformed equation and operation used.',
    };
  });

  const similarFilter = {};
  if (subject) similarFilter.subject = subject;
  if (questionText) similarFilter.question = { $regex: questionText.slice(0, 40), $options: 'i' };

  let similar = await MCQModel.find(similarFilter).limit(5).lean();
  if (!similar.length) {
    similar = await MCQModel.find(subject ? { subject } : {}).limit(5).lean();
  }

  res.json({
    analysis,
    correctSteps: analysis.filter((item) => item.correct).length,
    totalSteps: analysis.length,
    suggestedSolution: [
      'Isolate variable terms on one side of the equation.',
      'Simplify constants step-by-step.',
      'Apply inverse operation to solve for the unknown.',
      'Substitute result into original equation to verify.',
    ],
    similarQuestions: similar.map((item) => ({
      id: String(item._id),
      subject: item.subject,
      topic: item.topic,
      question: item.question,
      difficulty: item.difficulty,
    })),
  });
});

app.get('/api/practice-board/questions', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim().toLowerCase();
    const difficulty = String(req.query.difficulty || '').trim();
    const search = String(req.query.search || '').trim();
    const { page, limit, skip } = readPagination(req.query, { defaultLimit: 100, maxLimit: 500 });

    const filter = {};
    if (subject) filter.subject = subject;
    if (difficulty) filter.difficulty = difficulty;
    if (search) {
      const expr = containsRegex(search, 120);
      filter.$or = [{ questionText: expr }, { solutionText: expr }];
    }

    const questions = await PracticeBoardQuestionModel.find(filter)
      .select(PRACTICE_BOARD_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json({ page, limit, questions: questions.map((item) => serializePracticeBoardQuestion(item)), total: questions.length });
  } catch {
    res.status(500).json({ error: 'Failed to load practice board questions.' });
  }
});

app.get('/api/practice-board/questions/random', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim().toLowerCase();
    const difficulty = String(req.query.difficulty || '').trim();
    const excludeId = String(req.query.excludeId || '').trim();

    const filter = {};
    if (subject) filter.subject = subject;
    if (difficulty) filter.difficulty = difficulty;
    if (excludeId && isValidObjectId(excludeId)) {
      filter._id = { $ne: excludeId };
    }

    const count = await PracticeBoardQuestionModel.countDocuments(filter);
    if (!count) {
      res.status(404).json({ error: 'No practice board questions found for this selection.' });
      return;
    }

    const randomIndex = Math.floor(Math.random() * count);
    const item = await PracticeBoardQuestionModel.findOne(filter).skip(randomIndex).lean();
    if (!item) {
      res.status(404).json({ error: 'No practice board question available.' });
      return;
    }

    res.json({ question: serializePracticeBoardQuestion(item) });
  } catch {
    res.status(500).json({ error: 'Failed to load random practice board question.' });
  }
});

app.post('/api/question-submissions', async (req, res) => {
  try {
    const {
      subject,
      questionText = '',
      questionDescription = '',
      questionSource = '',
      submissionReason = '',
      attachments = [],
      submittedByName = '',
      submittedByEmail = '',
      submittedByUserId = '',
      submittedByClientId = '',
    } = req.body || {};

    const policy = await getContributionPolicy();
    const normalizedSubject = String(subject || '').trim();
    const actorKey = normalizeContributionActorKey({
      submittedByUserId,
      submittedByClientId,
      submittedByEmail,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!normalizedSubject) {
      res.status(400).json({ error: 'Subject is required.' });
      return;
    }

    const restrictionState = await checkSubmissionRestriction(actorKey);
    if (restrictionState.restricted) {
      res.status(403).json({
        error: CONTENT_RESTRICTION_MESSAGE,
        code: 'UPLOAD_RESTRICTED',
        blockedUntil: restrictionState.blockedUntil,
      });
      return;
    }

    const rawAttachments = Array.isArray(attachments) ? attachments : [];
    if (rawAttachments.length > policy.maxFilesPerSubmission) {
      res.status(400).json({ error: `You can upload up to ${policy.maxFilesPerSubmission} files per submission.` });
      return;
    }

    const safeAttachments = rawAttachments.map((file) => ({
      name: String(file?.name || '').trim(),
      mimeType: String(file?.mimeType || '').trim(),
      size: Number(file?.size || 0),
      dataUrl: String(file?.dataUrl || '').trim(),
    }));

    const allowedMimeTypes = new Set(policy.allowedMimeTypes);

    for (const file of safeAttachments) {
      if (!file.name || !file.mimeType || !file.dataUrl || !Number.isFinite(file.size)) {
        res.status(400).json({ error: 'Each attachment must include name, mimeType, size, and file data.' });
        return;
      }
      if (!allowedMimeTypes.has(file.mimeType)) {
        res.status(400).json({ error: `Unsupported attachment type: ${file.mimeType}` });
        return;
      }
      if (file.size > policy.maxFileSizeBytes) {
        res.status(400).json({ error: 'Upload failed: File size exceeds the allowed limit.' });
        return;
      }
      if (!file.dataUrl.startsWith('data:')) {
        res.status(400).json({ error: `Attachment ${file.name} is not a valid uploaded file payload.` });
        return;
      }
    }

    const text = String(questionText || '').trim();
    const description = String(questionDescription || '').trim();
    const source = String(questionSource || '').trim();
    const reason = String(submissionReason || '').trim();

    if (!text && !safeAttachments.length) {
      res.status(400).json({ error: 'Please provide a typed/pasted question or at least one attachment.' });
      return;
    }

    if (!reason) {
      res.status(400).json({ error: 'Please explain why this question should be added.' });
      return;
    }

    const todayStart = startOfTodayUtc();
    const todayCount = await QuestionSubmissionModel.countDocuments({
      actorKey,
      createdAt: { $gte: todayStart },
    });

    if (todayCount >= policy.maxSubmissionsPerDay) {
      res.status(429).json({ error: `Daily limit reached. You can submit up to ${policy.maxSubmissionsPerDay} times per day.` });
      return;
    }

    const moderation = moderateQuestionSubmission({
      subject: normalizedSubject,
      questionText: text,
      questionDescription: description,
      questionSource: source,
      submissionReason: reason,
      attachments: safeAttachments.map((file) => ({
        ...file,
        extractedSnippet: getAttachmentSignalSnippet(file),
      })),
    });

    const isRejectedByModeration = moderation.result === 'rejected';
    const autoReviewNote = isRejectedByModeration
      ? `Auto moderation: ${moderation.reasons.join(' ')}`
      : '';

    const created = await QuestionSubmissionModel.create({
      subject: normalizedSubject,
      questionText: text,
      questionDescription: description,
      questionSource: source,
      submissionReason: reason,
      attachments: safeAttachments,
      status: isRejectedByModeration ? 'rejected' : 'pending',
      queuedForBank: false,
      submittedByName: String(submittedByName || '').trim(),
      submittedByEmail: String(submittedByEmail || '').trim(),
      submittedByUserId: String(submittedByUserId || '').trim(),
      submittedByClientId: String(submittedByClientId || '').trim(),
      actorKey,
      moderation: {
        result: moderation.result,
        reasons: moderation.reasons,
        score: moderation.score,
        blockedActor: isRejectedByModeration,
        reviewedAt: isRejectedByModeration ? new Date() : null,
      },
      reviewNotes: autoReviewNote,
      reviewedAt: isRejectedByModeration ? new Date() : null,
      reviewedByEmail: isRejectedByModeration ? 'AI moderation' : '',
    });

    if (isRejectedByModeration) {
      const blockedUntil = await blockSubmissionActor(actorKey, moderation.reasons.join(' '), policy.blockDurationMinutes);
      res.status(403).json({
        error: CONTENT_RESTRICTION_MESSAGE,
        code: 'CONTENT_RESTRICTED',
        blockedUntil,
        submission: serializeQuestionSubmission(created),
      });
      return;
    }

    res.status(201).json({ submission: serializeQuestionSubmission(created) });
  } catch {
    res.status(500).json({ error: 'Failed to submit question.' });
  }
});

app.get('/api/question-submissions/access', async (req, res) => {
  try {
    const submittedByEmail = String(req.query.submittedByEmail || '').trim();
    const submittedByUserId = String(req.query.submittedByUserId || '').trim();
    const submittedByClientId = String(req.query.submittedByClientId || '').trim();
    const actorKey = normalizeContributionActorKey({
      submittedByEmail,
      submittedByUserId,
      submittedByClientId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const policy = await getContributionPolicy();
    const restrictionState = await checkSubmissionRestriction(actorKey);
    const todayCount = await QuestionSubmissionModel.countDocuments({
      actorKey,
      createdAt: { $gte: startOfTodayUtc() },
    });

    res.json({
      blocked: restrictionState.restricted,
      blockedUntil: restrictionState.blockedUntil || null,
      message: restrictionState.restricted ? CONTENT_RESTRICTION_MESSAGE : '',
      limits: {
        maxSubmissionsPerDay: policy.maxSubmissionsPerDay,
        maxFilesPerSubmission: policy.maxFilesPerSubmission,
        maxFileSizeBytes: policy.maxFileSizeBytes,
        remainingSubmissionsToday: Math.max(0, policy.maxSubmissionsPerDay - todayCount),
        allowedMimeTypes: policy.allowedMimeTypes,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load contribution access policy.' });
  }
});

app.get('/api/question-submissions/history', async (req, res) => {
  const rawIds = String(req.query.ids || '').trim();
  if (!rawIds) {
    res.json({ submissions: [] });
    return;
  }

  const ids = rawIds
    .split(',')
    .map((value) => String(value || '').trim())
    .filter((value) => isValidObjectId(value))
    .slice(0, 100);

  if (!ids.length) {
    res.json({ submissions: [] });
    return;
  }

  const submissions = await QuestionSubmissionModel.find({ _id: { $in: ids } })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ submissions: submissions.map((item) => serializeQuestionSubmission(item)) });
});

app.post('/api/ai/mentor/chat', authMiddleware, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const context = String(req.body?.context || '').trim();

  if (!message) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  const premium = ensurePremiumAccess(req.user, res);
  if (!premium) return;

  const day = new Date().toISOString().slice(0, 10);
  const usage = await AIUsageModel.findOneAndUpdate(
    { userId: req.user._id, day },
    { $inc: { chatCount: 1 } },
    { upsert: true, new: true },
  );

  if ((usage.chatCount || 0) > premium.plan.dailyAiLimit) {
    res.status(429).json({ error: `Daily guidance limit reached (${premium.plan.dailyAiLimit}). Please continue tomorrow.` });
    return;
  }

  const openAiContext = await getOpenAiClientContext();
  const aiClient = openAiContext.client;
  const aiModel = openAiContext.model;

  if (!aiClient) {
    res.status(503).json({ error: 'OpenAI API is not configured. Set OPENAI_API_KEY on the server to use Ask Doubt.' });
    return;
  }

  let answer = '';
  let structuredAnswer = null;

  try {
    const completion = await aiClient.chat.completions.create({
      model: aiModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are NET360 Smart Study Mentor powered by OpenAI.',
            'Solve as a top tutor: clear concept teaching + exam strategy.',
            'Return strict JSON only with EXACT keys:',
            'conceptExplanation: string',
            'stepByStepSolution: string[]',
            'finalAnswer: string',
            'shortestTrick: string',
            'Rules:',
            '- conceptExplanation: 3 to 6 concise lines, beginner-friendly.',
            '- stepByStepSolution: 4 to 8 numbered-ready steps, each one actionable and specific.',
            '- finalAnswer: one crisp final result/conclusion.',
            '- shortestTrick: fast MCQ method, elimination trick, or shortcut formula where applicable.',
            '- For math/physics/chemistry, include formula usage and unit sanity checks when relevant.',
            '- No markdown, no code fences, no extra keys.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: context ? `Context: ${context}\n\nStudent question: ${message}` : `Student question: ${message}`,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    structuredAnswer = tightenStructuredTutorAnswer(extractJsonObject(raw), null);
  } catch {
    structuredAnswer = null;
  }

  if (!structuredAnswer) {
    res.status(502).json({ error: 'Could not generate a structured response from OpenAI right now. Please try again.' });
    return;
  }

  answer = formatStructuredStudyResponse({
    conceptExplanation: structuredAnswer.conceptExplanation,
    steps: structuredAnswer.stepByStepSolution,
    finalAnswer: structuredAnswer.finalAnswer,
    quickTrick: structuredAnswer.shortestTrick,
  });

  const parsedAnswer = parseStructuredAnswerSections(answer);

  res.json({
    answer,
    structuredAnswer: {
      conceptExplanation: parsedAnswer.conceptExplanation,
      stepByStepSolution: parsedAnswer.stepByStepSolution,
      finalAnswer: parsedAnswer.finalAnswer,
      shortestTrick: parsedAnswer.shortestTrick,
    },
    usage: {
      usedToday: usage.chatCount,
      remainingToday: Math.max(0, premium.plan.dailyAiLimit - usage.chatCount),
    },
  });
});

app.post('/api/ai/mentor/export', authMiddleware, async (req, res) => {
  const premium = ensurePremiumAccess(req.user, res);
  if (!premium) return;

  const format = normalizeMentorExportFormat(req.body?.format);
  const tool = normalizeMentorExportTool(req.body?.tool);

  if (!format) {
    res.status(400).json({ error: 'Export format must be pdf or word.' });
    return;
  }

  if (!tool) {
    res.status(400).json({ error: 'Export tool must be one of: question-solve, doubt-support, study-planner.' });
    return;
  }

  const payload = buildMentorExportPayload({
    tool,
    payload: req.body?.payload || {},
    user: req.user,
  });

  const dateTag = new Date().toISOString().slice(0, 10);
  const baseName = `net360-${tool}-${dateTag}`;

  if (format === 'pdf') {
    const bytes = await buildStructuredDocumentPdfBuffer(payload);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
    res.send(bytes);
    return;
  }

  const bytes = await buildStructuredWordBuffer(payload);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}.docx"`);
  res.send(bytes);
});

app.get('/api/subscriptions/plans', (_req, res) => {
  res.json({ plans: Object.values(SUBSCRIPTION_PLANS) });
});

app.get('/api/subscriptions/me', authMiddleware, async (req, res) => {
  const subscription = normalizeSubscription(req.user);
  const plan = resolveSubscriptionPlan(subscription.planId);
  const day = new Date().toISOString().slice(0, 10);
  const usage = await AIUsageModel.findOne({ userId: req.user._id, day }).lean();
  const latestActivationRequest = await PremiumSubscriptionRequestModel
    .findOne({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();
  const requestPlan = resolveSubscriptionPlan(latestActivationRequest?.planId || '');

  res.json({
    subscription: {
      ...subscription,
      isActive: isSubscriptionActive(subscription),
      planName: plan?.name || '',
      dailyAiLimit: plan?.dailyAiLimit || 0,
    },
    activationRequest: latestActivationRequest
      ? serializePremiumSubscriptionRequest(latestActivationRequest, requestPlan?.name || '')
      : null,
    usage: {
      day,
      chatCount: usage?.chatCount || 0,
      solverCount: usage?.solverCount || 0,
      tokenConsumed: usage?.tokenConsumed || 0,
      remainingToday: Math.max(0, (plan?.dailyAiLimit || 0) - ((usage?.chatCount || 0) + (usage?.solverCount || 0))),
    },
  });
});

app.post('/api/subscriptions/purchase', authMiddleware, async (req, res) => {
  res.status(410).json({
    error: 'Direct activation is disabled. Submit payment proof and activate using admin-issued token.',
  });
});

app.post('/api/subscriptions/request-activation', authMiddleware, async (req, res) => {
  const planId = String(req.body?.planId || '').trim();
  const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
  const paymentTransactionId = sanitizePlainText(req.body?.paymentTransactionId || '', 120);
  const plan = resolveSubscriptionPlan(planId);

  let paymentProof;
  try {
    paymentProof = normalizePaymentProof(req.body?.paymentProof);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Payment proof is invalid.' });
    return;
  }

  if (!plan) {
    res.status(400).json({ error: 'Invalid plan selected.' });
    return;
  }

  if (!['easypaisa', 'jazzcash', 'bank_transfer'].includes(paymentMethod)) {
    res.status(400).json({ error: 'Payment method must be one of: easypaisa, jazzcash, bank_transfer.' });
    return;
  }

  if (!paymentTransactionId || paymentTransactionId.length < 4) {
    res.status(400).json({ error: 'Payment transaction ID is required for verification.' });
    return;
  }

  const normalizedMobile = normalizeMobileNumber(req.user.phone || '');
  if (!isValidWhatsAppNumber(normalizedMobile)) {
    res.status(400).json({ error: 'Your account mobile number must be in international format (e.g. +923XXXXXXXXX).' });
    return;
  }

  const existingPending = await PremiumSubscriptionRequestModel.findOne({
    userId: req.user._id,
    status: 'pending',
  }).lean();
  if (existingPending) {
    res.status(409).json({ error: 'A premium activation request is already pending for your account.' });
    return;
  }

  const request = await PremiumSubscriptionRequestModel.create({
    userId: req.user._id,
    email: req.user.email,
    mobileNumber: normalizedMobile,
    planId: plan.id,
    paymentMethod,
    paymentTransactionId,
    paymentProof,
    status: 'pending',
  });

  res.status(201).json({
    ok: true,
    request: serializePremiumSubscriptionRequest(request, plan.name),
    message: 'Premium activation request submitted. Wait for admin verification and token.',
  });
});

app.get('/api/subscriptions/activation-token-inbox', authMiddleware, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findOne({
    userId: req.user._id,
    status: 'approved',
    activationTokenId: { $ne: null },
  }).sort({ updatedAt: -1 });

  if (!request?.activationTokenId) {
    res.json({ tokenCode: '', requestStatus: 'pending' });
    return;
  }

  const activationToken = await PremiumActivationTokenModel.findById(request.activationTokenId);
  if (!activationToken) {
    res.json({ tokenCode: '', requestStatus: 'pending' });
    return;
  }

  if (activationToken.status !== 'active') {
    res.json({ tokenCode: '', requestStatus: activationToken.status });
    return;
  }

  if (!activationToken.inAppSentAt) {
    res.json({ tokenCode: '', requestStatus: 'approved' });
    return;
  }

  if (new Date(activationToken.expiresAt).getTime() <= Date.now()) {
    activationToken.status = 'expired';
    await activationToken.save();
    res.json({ tokenCode: '', requestStatus: 'expired' });
    return;
  }

  res.json({
    tokenCode: activationToken.code,
    requestStatus: 'sent',
    sentAt: activationToken.inAppSentAt ? new Date(activationToken.inAppSentAt).toISOString() : null,
    expiresAt: activationToken.expiresAt ? new Date(activationToken.expiresAt).toISOString() : null,
  });
});

app.post('/api/subscriptions/activate-with-token', authMiddleware, async (req, res) => {
  const tokenCode = String(req.body?.tokenCode || '').trim().toUpperCase();
  if (!tokenCode) {
    res.status(400).json({ error: 'Activation token is required.' });
    return;
  }

  const activationToken = await PremiumActivationTokenModel.findOne({ code: tokenCode });
  if (!activationToken) {
    res.status(400).json({ error: 'Invalid activation token.' });
    return;
  }

  if (String(activationToken.userId) !== String(req.user._id)) {
    res.status(403).json({ error: 'This token does not belong to your account.' });
    return;
  }

  if (activationToken.status !== 'active') {
    res.status(400).json({ error: 'This activation token is no longer active.' });
    return;
  }

  if (new Date(activationToken.expiresAt).getTime() <= Date.now()) {
    activationToken.status = 'expired';
    await activationToken.save();
    res.status(400).json({ error: 'Activation token expired. Request a new one from admin.' });
    return;
  }

  const request = await PremiumSubscriptionRequestModel.findById(activationToken.premiumRequestId);
  if (!request) {
    res.status(400).json({ error: 'Premium activation request not found for this token.' });
    return;
  }

  if (request.status !== 'approved') {
    res.status(400).json({ error: 'This premium activation request is not approved yet.' });
    return;
  }

  const plan = resolveSubscriptionPlan(request.planId);
  if (!plan) {
    res.status(400).json({ error: 'Approved plan is invalid. Contact admin.' });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
  const nextSubscription = {
    status: 'active',
    planId: plan.id,
    billingCycle: plan.billingCycle,
    startedAt,
    expiresAt,
    paymentReference: request.paymentTransactionId,
    lastActivatedAt: startedAt,
  };

  await UserModel.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        subscription: nextSubscription,
      },
    },
    { runValidators: true },
  );

  req.user.subscription = nextSubscription;

  activationToken.status = 'used';
  activationToken.usedAt = new Date();
  await activationToken.save();

  request.status = 'completed';
  await request.save();

  const updatedUser = await UserModel.findById(req.user._id).lean();
  const normalizedSubscription = normalizeSubscription(updatedUser || req.user);

  res.status(201).json({
    ok: true,
    subscription: {
      ...normalizedSubscription,
      isActive: isSubscriptionActive(normalizedSubscription),
      planName: plan.name,
      dailyAiLimit: plan.dailyAiLimit,
    },
  });
});

app.post('/api/ai/mentor/solve-image', authMiddleware, async (req, res) => {
  const premium = ensurePremiumAccess(req.user, res);
  if (!premium) return;

  const openAiContext = await getOpenAiClientContext();
  const aiClient = openAiContext.client;
  const aiModel = openAiContext.model;

  if (!aiClient) {
    res.status(503).json({ error: 'OpenAI API is not configured. Set OPENAI_API_KEY on the server to use Question Solver.' });
    return;
  }

  const imageDataUrl = String(req.body?.imageDataUrl || '').trim();
  const providedText = String(req.body?.questionText || '').trim();
  const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();

  const isImageAllowed = !mimeType || mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg';
  if (!isImageAllowed) {
    res.status(400).json({ error: 'Only JPG and PNG images are supported.' });
    return;
  }

  if (!imageDataUrl && !providedText) {
    res.status(400).json({ error: 'Question image or extracted question text is required.' });
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  let usage = await AIUsageModel.findOne({ userId: req.user._id, day });
  if (!usage) {
    usage = await AIUsageModel.create({ userId: req.user._id, day, chatCount: 0, solverCount: 0, tokenConsumed: 0 });
  }

  const usedToday = (usage.chatCount || 0) + (usage.solverCount || 0);
  if (usedToday >= premium.plan.dailyAiLimit) {
    res.status(429).json({ error: `Daily guidance limit reached (${premium.plan.dailyAiLimit}). Please continue tomorrow.` });
    return;
  }

  let extractedQuestion = providedText;

  if (!extractedQuestion && imageDataUrl && aiClient) {
    try {
      const ocrCompletion = await aiClient.chat.completions.create({
        model: aiModel,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Extract only the readable question text from this educational image. Return plain text only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract question text exactly as visible.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      });
      extractedQuestion = (ocrCompletion.choices?.[0]?.message?.content || '').trim();
    } catch {
      extractedQuestion = '';
    }
  }

  if (!extractedQuestion) {
    extractedQuestion = providedText || 'Could not extract text from image. Please type the question manually.';
  }

  const subject = inferSubject(extractedQuestion);
  const topic = inferTopic(extractedQuestion, subject);
  let structured = null;

  try {
    const prompt = [
      'You are an expert NET exam tutor and problem-solver.',
      `Detected subject: ${subject}`,
      `Detected topic: ${topic}`,
      'Solve the question accurately and educationally like ChatGPT teaching a student.',
      'Return ONLY valid JSON with EXACT keys:',
      'conceptExplanation: string',
      'stepByStepSolution: string[]',
      'finalAnswer: string',
      'shortestTrick: string',
      'Requirements:',
      '- conceptExplanation: clear and concise, 3 to 6 lines.',
      '- stepByStepSolution: 4 to 8 ordered steps, each explicit and practical.',
      '- Include formulas, substitutions, and unit checks where relevant.',
      '- finalAnswer must be explicit and unambiguous.',
      '- shortestTrick must be a fast test-taking method for similar problems.',
      '- If information is ambiguous, state assumptions and proceed logically.',
      'Question:',
      extractedQuestion,
    ].join('\n');

    const solveCompletion = await aiClient.chat.completions.create({
      model: aiModel,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown. No code fences. No extra keys.' },
        { role: 'user', content: prompt },
      ],
    });

    const raw = (solveCompletion.choices?.[0]?.message?.content || '').trim();
    const parsed = extractJsonObject(raw);
    structured = tightenStructuredTutorAnswer(parsed, null);
  } catch {
    structured = null;
  }

  if (!structured) {
    structured = fallbackStructuredSolver(extractedQuestion, subject, topic);
  }

  usage.solverCount = (usage.solverCount || 0) + 1;
  usage.tokenConsumed = (usage.tokenConsumed || 0) + estimateTokenUsage(`${extractedQuestion}\n${JSON.stringify(structured)}`);
  await usage.save();

  res.status(201).json({
    questionText: extractedQuestion,
    detected: { subject, topic },
    result: structured,
    usage: {
      usedToday: (usage.chatCount || 0) + (usage.solverCount || 0),
      remainingToday: Math.max(0, premium.plan.dailyAiLimit - ((usage.chatCount || 0) + (usage.solverCount || 0))),
      tokenConsumed: usage.tokenConsumed || 0,
    },
  });
});

app.post('/api/study-plans/generate', authMiddleware, async (req, res) => {
  const targetDate = String(req.body?.targetDate || '').trim();
  const preparationLevel = String(req.body?.preparationLevel || '').trim() || 'intermediate';
  const weakSubjects = Array.isArray(req.body?.weakSubjects)
    ? req.body.weakSubjects.map((item) => String(item).toLowerCase().trim()).filter(Boolean)
    : [];
  const dailyStudyHours = clamp(Number(req.body?.dailyStudyHours) || 3, 1, 14);

  const plan = generateStudyPlan({
    targetDate,
    preparationLevel,
    weakSubjects,
    dailyStudyHours,
  });

  req.user.progress = { ...defaultProgress(), ...(req.user.progress || {}), studyPlan: plan };
  await req.user.save();

  res.status(201).json({ studyPlan: plan });
});

app.get('/api/study-plans/latest', authMiddleware, async (req, res) => {
  const studyPlan = req.user.progress?.studyPlan || null;
  res.json({ studyPlan });
});

app.post('/api/tests/start', authMiddleware, async (req, res) => {
  const {
    subject,
    part,
    chapter,
    section,
    difficulty,
    topic,
    mode,
    questionCount = 20,
    netType,
    testType,
    selectedSubject,
  } = req.body || {};

  if (!mode) {
    res.status(400).json({ error: 'mode is required.' });
    return;
  }

  const normalizedMode = String(mode);
  const normalizedSubject = String(subject || 'mathematics').toLowerCase();
  const normalizedDifficulty = String(difficulty || 'Medium');
  const normalizedPart = String(part || '').toLowerCase().trim();
  const normalizedChapter = String(chapter || '').trim();
  const normalizedSection = String(section || '').trim();
  const normalizedTopic = String(topic || '').trim();
  const normalizedNetType = normalizeNetType(netType);
  const profile = NET_TEST_PROFILES[normalizedNetType] || NET_TEST_PROFILES['net-engineering'];
  const normalizedTestType = String(testType || '').toLowerCase();
  const isPreparationTopicSession = normalizedMode === 'topic';
  const requestedQuestions = Number(questionCount) || (normalizedMode === 'mock' ? profile.totalQuestions : 20);
  const desiredQuestions = isPreparationTopicSession
    ? 25
    : clamp(requestedQuestions, 1, 200);

  const normalizeTextForMatch = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const exactThenContains = (rows, key, requested) => {
    const query = normalizeTextForMatch(requested);
    if (!query) return rows;
    const exact = rows.filter((item) => normalizeTextForMatch(item?.[key]) === query);
    if (exact.length) return exact;
    return rows.filter((item) => normalizeTextForMatch(item?.[key]).includes(query));
  };

  let selected = [];
  const allInProfile = await MCQModel.find({
    subject: {
      $in: Array.from(new Set(profile.distribution.flatMap((item) => item.sourceSubjects))),
    },
  }).lean();

  if (normalizedTestType === 'full-mock' || normalizedMode === 'mock') {
    selected = pickFromPoolsByDistribution({
      distribution: profile.distribution,
      pool: allInProfile,
      totalQuestions: profile.totalQuestions,
    });
  } else if (normalizedTestType === 'subject-wise') {
    const pickedSubject = String(selectedSubject || normalizedSubject || '').toLowerCase();
    const subjectCount = profile.subjectWiseQuestions[pickedSubject] || desiredQuestions;
    const subjectPool = await MCQModel.find({ subject: pickedSubject }).lean();
    selected = shuffle(subjectPool).slice(0, Math.min(subjectCount, subjectPool.length));
  } else if (normalizedTestType === 'adaptive' || normalizedMode === 'adaptive') {
    const weakTopics = req.user.progress?.weakTopics || [];
    selected = generateAdaptiveSet({
      profile,
      allQuestions: allInProfile,
      weakTopics,
      questionCount: desiredQuestions,
      userProgress: req.user.progress || defaultProgress(),
    });
  } else {
    const baseFilter = {
      subject: normalizedSubject,
    };
    if (normalizedPart) {
      baseFilter.part = normalizedPart;
    }

    const applyHierarchyFilters = (rows) => {
      let scoped = [...rows];

      if (normalizedChapter && normalizedChapter !== 'All Chapters') {
        scoped = exactThenContains(scoped, 'chapter', normalizedChapter);
      }
      if (normalizedSection && normalizedSection !== 'All Sections') {
        scoped = exactThenContains(scoped, 'section', normalizedSection);
      }
      if (normalizedTopic && normalizedTopic !== 'All Topics') {
        const byTopic = exactThenContains(scoped, 'topic', normalizedTopic);
        if (byTopic.length) {
          scoped = byTopic;
        }
      }

      return scoped;
    };

    const difficultyFilter = {
      ...baseFilter,
      difficulty: normalizedDifficulty,
    };

    let pool = applyHierarchyFilters(await MCQModel.find(difficultyFilter).lean());

    // If selected difficulty has no rows, fallback to any difficulty for same saved hierarchy.
    if (!pool.length) {
      pool = applyHierarchyFilters(await MCQModel.find(baseFilter).lean());
    }

    selected = shuffle(pool).slice(0, Math.min(desiredQuestions, pool.length));
  }

  console.log('TEST FILTER', {
    subject: normalizedSubject,
    part: normalizedPart,
    chapter: normalizedChapter,
    section: normalizedSection,
    difficulty: normalizedDifficulty,
    topic: normalizedTopic,
    mode: normalizedMode,
    testType: normalizedTestType,
  });
  console.log('MCQ COUNT', selected.length);

  if (!selected.length) {
    res.status(404).json({ error: 'No questions available for this configuration.' });
    return;
  }

  const questions = selected.map((question) => {
    const serialized = serializeMcq(question);
    return {
      id: String(question._id),
      subject: question.subject,
      part: String(question.part || '').trim(),
      chapter: String(question.chapter || '').trim(),
      section: String(question.section || '').trim(),
      topic: question.topic,
      question: question.question,
      questionImageUrl: String(question.questionImageUrl || '').trim(),
      questionImage: serialized.questionImage || null,
      options: serialized.options,
      optionMedia: serialized.optionMedia || [],
      difficulty: question.difficulty,
      explanation: serialized.explanationText || '',
      explanationImage: serialized.explanationImage || null,
      shortTrick: serialized.shortTrickText || '',
      shortTrickImage: serialized.shortTrickImage || null,
    };
  });

  const answerKey = {};
  questions.forEach((question) => {
    const answerRaw = String(selected.find((entry) => String(entry._id) === question.id)?.answer || '').trim();
    const loweredAnswer = answerRaw.toLowerCase();

    let answerKeyValue = '';
    (Array.isArray(question.optionMedia) ? question.optionMedia : []).forEach((option) => {
      if (!answerKeyValue && String(option?.text || '').trim().toLowerCase() === loweredAnswer) {
        answerKeyValue = String(option.key || '').trim().toUpperCase();
      }
    });

    if (!answerKeyValue) {
      const direct = answerRaw.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
      if (direct) {
        const token = direct[1];
        const idx = /^\d+$/.test(token) ? Number(token) - 1 : token.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < question.optionMedia.length) {
          answerKeyValue = String(question.optionMedia[idx].key || '').trim().toUpperCase();
        }
      }
    }

    if (!answerKeyValue) {
      answerKeyValue = 'A';
    }

    answerKey[String(question.id)] = answerKeyValue;
  });

  const session = await TestSessionModel.create({
    userId: req.user._id,
    subject: normalizedMode === 'mock' ? normalizedSubject : normalizedSubject,
    difficulty: normalizedDifficulty,
    topic: String(topic || (normalizedMode === 'mock' ? 'Full Mock' : 'All Topics')),
    mode: normalizedMode,
    questions,
    answerKey,
    questionIds: questions.map((item) => item.id),
    questionCount: questions.length,
    durationMinutes:
      normalizedMode === 'mock' || normalizedTestType === 'full-mock'
        ? profile.durationMinutes
        : Math.max(10, Math.round(questions.length * 1.2)),
    startedAt: new Date(),
    finishedAt: null,
  });

  const serialized = serializeSession(session);
  serialized.netType = normalizedNetType;
  serialized.testType = normalizedTestType || normalizedMode;
  serialized.config = {
    profile: profile.label,
    requestedTestType: normalizedTestType || normalizedMode,
    distribution: profile.distribution,
    selectedSubject: selectedSubject || null,
  };

  res.status(201).json({ session: serialized });
});

app.get('/api/tests/attempts', authMiddleware, async (req, res) => {
  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).lean();
  res.json({ attempts: attempts.map((item) => serializeAttempt(item)) });
});

app.get('/api/tests/:sessionId', authMiddleware, async (req, res) => {
  if (!isValidObjectId(req.params.sessionId)) {
    res.status(400).json({ error: 'Invalid session id.' });
    return;
  }

  const session = await TestSessionModel.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  res.json({ session: serializeSession(session) });
});

app.post('/api/tests/:sessionId/cancel', authMiddleware, async (req, res) => {
  if (!isValidObjectId(req.params.sessionId)) {
    res.status(400).json({ error: 'Invalid session id.' });
    return;
  }

  const session = await TestSessionModel.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  if (session.cancelledAt) {
    res.json({ session: serializeSession(session) });
    return;
  }

  const existingAttempt = await AttemptModel.findOne({ sessionId: session._id, userId: req.user._id });
  if (existingAttempt) {
    res.status(409).json({ error: 'Session already submitted and cannot be cancelled.' });
    return;
  }

  const reason = String(req.body?.reason || 'Left secured test environment.').trim().slice(0, 200);
  const trigger = String(req.body?.trigger || '').trim().slice(0, 80);
  session.cancelledAt = new Date();
  session.cancelReason = reason;
  session.cancelTrigger = trigger;
  session.finishedAt = session.finishedAt || session.cancelledAt;
  await session.save();

  broadcastSyncEvent({
    role: 'student',
    event: 'sync',
    data: {
      type: 'test.session.cancelled',
      userId: String(req.user._id),
      sessionId: String(session._id),
    },
  });

  res.json({ session: serializeSession(session) });
});

app.post('/api/tests/:sessionId/finish', authMiddleware, async (req, res) => {
  if (!isValidObjectId(req.params.sessionId)) {
    res.status(400).json({ error: 'Invalid session id.' });
    return;
  }

  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const elapsedSeconds = Math.max(1, Number(req.body?.elapsedSeconds) || 60);

  const session = await TestSessionModel.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  if (session.cancelledAt) {
    res.status(409).json({ error: 'This test session was cancelled and cannot be submitted.' });
    return;
  }

  const existingAttempt = await AttemptModel.findOne({ sessionId: session._id, userId: req.user._id });
  if (existingAttempt) {
    res.json({ attempt: serializeAttempt(existingAttempt) });
    return;
  }

  const answerMap = new Map();
  answers.forEach((entry) => {
    if (!entry || !entry.questionId) return;
    answerMap.set(String(entry.questionId), entry.selectedOption == null ? null : String(entry.selectedOption));
  });

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unanswered = 0;

  const questionIds = Array.isArray(session.questionIds) ? session.questionIds : [];
  questionIds.forEach((questionId) => {
    const selectedOption = answerMap.has(questionId) ? answerMap.get(questionId) : null;
    const expected = String(session.answerKey?.get?.(questionId) || session.answerKey?.[questionId] || '').trim().toLowerCase();

    if (!selectedOption || String(selectedOption).trim().length === 0) {
      unanswered += 1;
      return;
    }

    const normalizedSelection = String(selectedOption).trim().toLowerCase();

    const questionRow = Array.isArray(session.questions)
      ? session.questions.find((item) => String(item?.id || '') === String(questionId))
      : null;
    const optionRows = Array.isArray(questionRow?.optionMedia) ? questionRow.optionMedia : [];
    const selectedOptionRow = optionRows.find((item) => String(item?.key || '').trim().toLowerCase() === normalizedSelection);
    const normalizedSelectionText = String(selectedOptionRow?.text || '').trim().toLowerCase();

    if (normalizedSelection === expected || (normalizedSelectionText && normalizedSelectionText === expected)) {
      correctAnswers += 1;
    } else {
      wrongAnswers += 1;
    }
  });

  const totalQuestions = questionIds.length || session.questionCount || 0;
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const submittedAt = new Date();

  session.finishedAt = submittedAt;
  await session.save();

  const attempt = await AttemptModel.create({
    sessionId: session._id,
    userId: req.user._id,
    subject: session.subject,
    topic: session.topic,
    difficulty: session.difficulty,
    mode: session.mode,
    score,
    totalQuestions,
    correctAnswers,
    wrongAnswers,
    unanswered,
    submittedAnswers: totalQuestions - unanswered,
    durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)),
    attemptedAt: submittedAt,
    submittedAt,
    metadata: {
      elapsedSeconds,
    },
  });

  await refreshUserProgress(req.user._id);
  broadcastSyncEvent({
    role: 'student',
    event: 'sync',
    data: { type: 'attempt.finished', userId: String(req.user._id), sessionId: String(session._id) },
  });
  broadcastSyncEvent({ role: 'admin', event: 'sync', data: { type: 'admin.analytics.updated' } });

  const review = (Array.isArray(session.questions) ? session.questions : []).map((item) => {
    const questionId = String(item?.id || '');
    const selectedKeyRaw = answerMap.has(questionId) ? answerMap.get(questionId) : null;
    const selectedKey = selectedKeyRaw ? String(selectedKeyRaw).trim().toUpperCase() : null;
    const expectedKey = String(session.answerKey?.get?.(questionId) || session.answerKey?.[questionId] || '').trim().toUpperCase();
    const optionMedia = Array.isArray(item?.optionMedia) ? item.optionMedia : [];
    const selectedOption = optionMedia.find((option) => String(option?.key || '').trim().toUpperCase() === selectedKey) || null;
    const correctOption = optionMedia.find((option) => String(option?.key || '').trim().toUpperCase() === expectedKey) || null;

    return {
      questionId,
      question: String(item?.question || ''),
      questionImage: item?.questionImage || null,
      optionMedia,
      selectedKey,
      correctKey: expectedKey,
      selectedText: selectedOption ? String(selectedOption.text || '') : '',
      correctText: correctOption ? String(correctOption.text || '') : '',
      isCorrect: Boolean(selectedKey) && selectedKey === expectedKey,
      explanationText: String(item?.explanation || '').trim(),
      explanationImage: item?.explanationImage || null,
      shortTrickText: String(item?.shortTrick || '').trim(),
      shortTrickImage: item?.shortTrickImage || null,
    };
  });

  res.status(201).json({ attempt: serializeAttempt(attempt), review });
});

app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
  const attempts = await AttemptModel.find({ userId: req.user._id }).lean();
  const testsAttempted = attempts.length;
  const averageScore = testsAttempted
    ? Math.round(attempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / testsAttempted)
    : 0;
  const studyHours = Number((attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0) / 60).toFixed(1));
  const questionsSolved = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);

  res.json({
    testsAttempted,
    averageScore,
    studyHours,
    questionsSolved,
    weakTopics: req.user.progress?.weakTopics || [],
  });
});

app.get('/api/reports/export', authMiddleware, async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase();
  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).lean();
  if (format !== 'pdf') {
    res.status(400).json({ error: 'Only PDF export is supported.' });
    return;
  }

  const questionBankTotal = await MCQModel.countDocuments();
  const bytes = await buildAnalyticsPdfBuffer({ attempts, user: req.user, questionBankTotal });
  const nameSeed = `${String(req.user.firstName || '').trim()} ${String(req.user.lastName || '').trim()}`.trim() || req.user.email || 'Student';
  const reportFileName = `NET360_Performance_Report_${sanitizeReportName(nameSeed)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFileName}"`);
  res.send(bytes);
});

app.get('/api/admin/overview', authMiddleware, requireAdmin, async (req, res) => {
  const [usersCount, mcqCount, attemptsCount, latestAttempts, pendingSignupRequests, pendingPremiumRequests, pendingQuestionSubmissions, recoveryRequestCount, recoverySentCount, recoveryPartialCount, recoveryFailedCount, recoveryNotFoundCount] = await Promise.all([
    UserModel.countDocuments(),
    MCQModel.countDocuments(),
    AttemptModel.countDocuments(),
    AttemptModel.find().sort({ attemptedAt: -1 }).limit(12).lean(),
    SignupRequestModel.countDocuments({ status: 'pending' }),
    PremiumSubscriptionRequestModel.countDocuments({ status: 'pending' }),
    QuestionSubmissionModel.countDocuments({ status: 'pending' }),
    PasswordRecoveryRequestModel.countDocuments(),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'sent' }),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'partial' }),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'failed' }),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'not_found' }),
  ]);

  const averageScore = latestAttempts.length
    ? Math.round(latestAttempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / latestAttempts.length)
    : 0;

  res.json({
    usersCount,
    mcqCount,
    attemptsCount,
    pendingSignupRequests,
    pendingPremiumRequests,
    pendingQuestionSubmissions,
    recoveryRequestCount,
    recoveryStatusCounts: {
      sent: recoverySentCount,
      partial: recoveryPartialCount,
      failed: recoveryFailedCount,
      not_found: recoveryNotFoundCount,
    },
    averageScore,
    recentAttempts: latestAttempts.map((item) => serializeAttempt(item)),
  });
});

app.get('/api/admin/configurations', authMiddleware, requireAdmin, async (_req, res) => {
  if (!CONFIG_CRYPTO_KEY) {
    res.status(503).json({ error: 'Secure config service is unavailable because CONFIG_ENCRYPTION_KEY is missing.' });
    return;
  }

  const rows = await RuntimeConfigModel.find({}).sort({ key: 1 }).lean();
  const variables = rows.map((item) => {
    let valuePreview = '';
    try {
      const plain = decryptConfigValue(item.encryptedValue || '');
      valuePreview = item.isSecret ? maskConfigValue(plain) : String(plain || '').slice(0, 120);
    } catch {
      valuePreview = '[decryption-error]';
    }

    return {
      key: String(item.key || ''),
      isSecret: Boolean(item.isSecret),
      description: String(item.description || ''),
      updatedByEmail: String(item.updatedByEmail || ''),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
      valuePreview,
    };
  });

  res.json({ variables });
});

app.put('/api/admin/configurations/:key', authMiddleware, requireAdmin, async (req, res) => {
  if (!CONFIG_CRYPTO_KEY) {
    res.status(503).json({ error: 'Secure config service is unavailable because CONFIG_ENCRYPTION_KEY is missing.' });
    return;
  }

  const key = normalizeConfigKey(req.params.key || req.body?.key || '');
  const value = String(req.body?.value || '');
  const description = sanitizePlainText(req.body?.description || '', 220);
  const isSecret = req.body?.isSecret !== false;

  if (!isValidConfigKey(key)) {
    res.status(400).json({ error: 'Invalid key. Use uppercase letters, numbers, and underscore only (e.g. OPENAI_API_KEY).' });
    return;
  }

  if (!value.trim()) {
    res.status(400).json({ error: 'Value is required.' });
    return;
  }

  if (value.length > 8000) {
    res.status(400).json({ error: 'Value is too long. Maximum 8000 characters.' });
    return;
  }

  const encryptedValue = encryptConfigValue(value);
  const saved = await RuntimeConfigModel.findOneAndUpdate(
    { key },
    {
      $set: {
        key,
        encryptedValue,
        isSecret,
        description,
        updatedByEmail: String(req.user?.email || ''),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  clearRuntimeConfigCache();

  res.json({
    variable: {
      key: String(saved?.key || key),
      isSecret: Boolean(saved?.isSecret),
      description: String(saved?.description || ''),
      updatedByEmail: String(saved?.updatedByEmail || ''),
      updatedAt: saved?.updatedAt ? new Date(saved.updatedAt).toISOString() : null,
      valuePreview: isSecret ? maskConfigValue(value) : value.slice(0, 120),
    },
  });
});

app.delete('/api/admin/configurations/:key', authMiddleware, requireAdmin, async (req, res) => {
  const key = normalizeConfigKey(req.params.key || '');
  if (!isValidConfigKey(key)) {
    res.status(400).json({ error: 'Invalid key.' });
    return;
  }

  await RuntimeConfigModel.deleteOne({ key });
  clearRuntimeConfigCache();
  res.json({ ok: true, key });
});

app.get('/api/admin/password-recovery-requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const q = String(req.query?.q || '').trim();

  const filter = status === 'all' ? {} : { recoveryStatus: status };
  if (q) {
    filter.$or = [
      { identifier: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { mobileNumber: { $regex: q, $options: 'i' } },
      { userName: { $regex: q, $options: 'i' } },
    ];
  }

  const requests = await PasswordRecoveryRequestModel.find(filter).sort({ createdAt: -1 }).limit(400).lean();
  res.json({ requests: requests.map((item) => serializePasswordRecoveryRequest(item)) });
});

app.get('/api/admin/question-submissions', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query.status || 'all').trim().toLowerCase();
  const subject = String(req.query.subject || '').trim();

  const filter = {};
  if (status !== 'all') {
    filter.status = status;
  }
  if (subject) {
    filter.subject = { $regex: subject, $options: 'i' };
  }

  const submissions = await QuestionSubmissionModel.find(filter).sort({ createdAt: -1 }).limit(600).lean();
  res.json({ submissions: submissions.map((item) => serializeQuestionSubmission(item)) });
});

app.get('/api/admin/question-submissions/policy', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const policy = await getContributionPolicy();
    res.json({ policy: serializeContributionPolicy(policy) });
  } catch {
    res.status(500).json({ error: 'Failed to load submission policy.' });
  }
});

app.put('/api/admin/question-submissions/policy', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const maxSubmissionsPerDay = clamp(Number(req.body?.maxSubmissionsPerDay) || DEFAULT_CONTRIBUTION_POLICY.maxSubmissionsPerDay, 1, 100);
    const maxFilesPerSubmission = clamp(Number(req.body?.maxFilesPerSubmission) || DEFAULT_CONTRIBUTION_POLICY.maxFilesPerSubmission, 1, 10);
    const maxFileSizeBytes = clamp(Number(req.body?.maxFileSizeBytes) || DEFAULT_CONTRIBUTION_POLICY.maxFileSizeBytes, 64 * 1024, 10 * 1024 * 1024);
    const blockDurationMinutes = clamp(Number(req.body?.blockDurationMinutes) || DEFAULT_CONTRIBUTION_POLICY.blockDurationMinutes, 5, 10080);

    const next = await ContributionPolicyModel.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          maxSubmissionsPerDay,
          maxFilesPerSubmission,
          maxFileSizeBytes,
          blockDurationMinutes,
          allowedMimeTypes: DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
          updatedByEmail: req.user.email,
        },
        $setOnInsert: {
          key: 'default',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    res.json({ policy: serializeContributionPolicy(next) });
  } catch {
    res.status(500).json({ error: 'Failed to update submission policy.' });
  }
});

app.post('/api/admin/question-submissions/:submissionId/review', authMiddleware, requireAdmin, async (req, res) => {
  const submission = await QuestionSubmissionModel.findById(req.params.submissionId);
  if (!submission) {
    res.status(404).json({ error: 'Question submission not found.' });
    return;
  }

  const nextStatus = String(req.body?.status || '').trim().toLowerCase();
  const reviewNotes = String(req.body?.reviewNotes || '').trim();

  if (!['approved', 'rejected'].includes(nextStatus)) {
    res.status(400).json({ error: 'status must be approved or rejected.' });
    return;
  }

  if (nextStatus === 'rejected' && !reviewNotes) {
    res.status(400).json({ error: 'Please provide a short explanation for rejection.' });
    return;
  }

  submission.status = nextStatus;
  submission.queuedForBank = nextStatus === 'approved';
  submission.reviewNotes = reviewNotes;
  submission.reviewedAt = new Date();
  submission.reviewedByEmail = req.user.email;
  if (nextStatus === 'approved' && submission.moderation?.result === 'rejected') {
    submission.moderation.result = 'manual-override';
    submission.moderation.reviewedAt = new Date();
  }
  await submission.save();

  res.json({ submission: serializeQuestionSubmission(submission) });
});

app.get('/api/admin/subscriptions/overview', authMiddleware, requireAdmin, async (_req, res) => {
  const now = new Date();
  const [activeUsers, expiredUsers, totalUsers, dailyUsage] = await Promise.all([
    UserModel.countDocuments({ 'subscription.status': 'active', 'subscription.expiresAt': { $gt: now } }),
    UserModel.countDocuments({ 'subscription.status': { $in: ['expired', 'cancelled'] } }),
    UserModel.countDocuments(),
    AIUsageModel.aggregate([
      { $group: { _id: '$day', chatCount: { $sum: '$chatCount' }, solverCount: { $sum: '$solverCount' }, tokenConsumed: { $sum: '$tokenConsumed' } } },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    expiredUsers,
    plans: Object.values(SUBSCRIPTION_PLANS),
    dailyUsage: dailyUsage.map((item) => ({
      day: item._id,
      chatCount: item.chatCount || 0,
      solverCount: item.solverCount || 0,
      tokenConsumed: item.tokenConsumed || 0,
    })),
  });
});

app.get('/api/admin/subscriptions/users', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const filter = {};
  if (status !== 'all') {
    filter['subscription.status'] = status;
  }

  const users = await UserModel.find(filter, {
    email: 1,
    firstName: 1,
    lastName: 1,
    subscription: 1,
  }).sort({ updatedAt: -1 }).limit(500).lean();

  res.json({
    users: users.map((item) => {
      const subscription = normalizeSubscription(item);
      const plan = resolveSubscriptionPlan(subscription.planId);
      return {
        id: String(item._id),
        email: item.email,
        firstName: item.firstName || '',
        lastName: item.lastName || '',
        subscription: {
          ...subscription,
          isActive: isSubscriptionActive(subscription),
          planName: plan?.name || '',
          dailyAiLimit: plan?.dailyAiLimit || 0,
        },
      };
    }),
  });
});

app.post('/api/admin/subscriptions/:userId/update', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const planId = String(req.body?.planId || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const paymentReference = String(req.body?.paymentReference || '').trim();
  const plan = resolveSubscriptionPlan(planId);

  if (!userId || !plan || !['active', 'inactive', 'expired', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'Valid userId, planId, and status are required.' });
    return;
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
  user.subscription = {
    status,
    planId: plan.id,
    billingCycle: plan.billingCycle,
    startedAt,
    expiresAt,
    paymentReference,
    lastActivatedAt: startedAt,
  };
  await user.save();

  res.json({ ok: true, userId, subscription: normalizeSubscription(user) });
});

app.get('/api/admin/subscriptions/requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const q = String(req.query?.q || '').trim();
  const filter = status === 'all' ? {} : { status };

  if (q) {
    filter.$or = [
      { email: { $regex: q, $options: 'i' } },
      { mobileNumber: { $regex: q, $options: 'i' } },
      { paymentTransactionId: { $regex: q, $options: 'i' } },
      { planId: { $regex: q, $options: 'i' } },
    ];
  }

  const requests = await PremiumSubscriptionRequestModel.find(filter).sort({ createdAt: -1 }).limit(400).lean();
  const tokenIds = requests
    .map((item) => item.activationTokenId)
    .filter(Boolean);
  const tokens = tokenIds.length
    ? await PremiumActivationTokenModel.find({ _id: { $in: tokenIds } }, { _id: 1, inAppSentAt: 1, status: 1 }).lean()
    : [];
  const tokenById = new Map(tokens.map((item) => [String(item._id), item]));

  res.json({
    requests: requests.map((item) => {
      const plan = resolveSubscriptionPlan(item.planId);
      const serialized = serializePremiumSubscriptionRequest(item, plan?.name || '');
      const token = item.activationTokenId ? tokenById.get(String(item.activationTokenId)) : null;
      const codeDeliveryStatus = token?.inAppSentAt ? 'sent' : token ? 'pending_send' : 'not_generated';
      return {
        ...serialized,
        codeDeliveryStatus,
        codeSentAt: token?.inAppSentAt ? new Date(token.inAppSentAt).toISOString() : null,
      };
    }),
  });
});

app.post('/api/admin/subscriptions/requests/:requestId/approve', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending premium requests can be approved.' });
    return;
  }

  const user = await UserModel.findById(request.userId).lean();
  if (!user) {
    request.status = 'rejected';
    request.notes = 'User account not found.';
    request.reviewedByAdminId = req.user._id;
    request.reviewedByEmail = req.user.email;
    request.reviewedAt = new Date();
    await request.save();
    res.status(409).json({ error: 'User account missing. Request auto-rejected.' });
    return;
  }

  let code = '';
  for (let i = 0; i < 5; i += 1) {
    const candidate = generatePremiumTokenCode();
    const exists = await PremiumActivationTokenModel.findOne({ code: candidate }).lean();
    if (!exists) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    res.status(500).json({ error: 'Could not generate unique premium activation token. Try again.' });
    return;
  }

  const expiresAt = new Date(Date.now() + PREMIUM_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const tokenDoc = await PremiumActivationTokenModel.create({
    code,
    userId: request.userId,
    email: request.email,
    premiumRequestId: request._id,
    status: 'active',
    expiresAt,
  });

  request.status = 'approved';
  request.activationTokenId = tokenDoc._id;
  request.notes = String(req.body?.notes || '').trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedByEmail = req.user.email;
  request.reviewedAt = new Date();
  await request.save();

  res.status(201).json({
    requestId: String(request._id),
    token: {
      code,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

app.post('/api/admin/subscriptions/requests/:requestId/send-code', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  if (request.status !== 'approved' || !request.activationTokenId) {
    res.status(400).json({ error: 'Approve and generate token before sending code.' });
    return;
  }

  const tokenDoc = await PremiumActivationTokenModel.findById(request.activationTokenId);
  if (!tokenDoc) {
    res.status(404).json({ error: 'Activation token not found for this request.' });
    return;
  }

  if (tokenDoc.status !== 'active') {
    res.status(400).json({ error: 'Only active tokens can be sent in-app.' });
    return;
  }

  if (new Date(tokenDoc.expiresAt).getTime() <= Date.now()) {
    tokenDoc.status = 'expired';
    await tokenDoc.save();
    res.status(400).json({ error: 'Token expired. Approve request again to generate a new code.' });
    return;
  }

  tokenDoc.inAppSentAt = new Date();
  tokenDoc.inAppSentByAdminId = req.user._id;
  await tokenDoc.save();

  res.json({
    ok: true,
    requestId: String(request._id),
    sentAt: tokenDoc.inAppSentAt ? new Date(tokenDoc.inAppSentAt).toISOString() : null,
  });
});

app.post('/api/admin/subscriptions/requests/:requestId/reject', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending premium requests can be rejected.' });
    return;
  }

  request.status = 'rejected';
  request.notes = String(req.body?.notes || '').trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedByEmail = req.user.email;
  request.reviewedAt = new Date();
  await request.save();

  res.json({ ok: true, requestId: String(request._id) });
});

app.get('/api/admin/signup-requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const filter = status === 'all' ? {} : { status };

  const requests = await SignupRequestModel.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  const tokenIds = requests
    .map((item) => item.signupTokenId)
    .filter(Boolean);
  const tokens = tokenIds.length
    ? await SignupTokenModel.find({ _id: { $in: tokenIds } }, { _id: 1, inAppSentAt: 1, status: 1 }).lean()
    : [];
  const tokenById = new Map(tokens.map((item) => [String(item._id), item]));

  res.json({
    requests: requests.map((item) => {
      const serialized = serializeSignupRequest(item);
      const token = item.signupTokenId ? tokenById.get(String(item.signupTokenId)) : null;
      const codeDeliveryStatus = token?.inAppSentAt ? 'sent' : token ? 'pending_send' : 'not_generated';
      return {
        ...serialized,
        codeDeliveryStatus,
        codeSentAt: token?.inAppSentAt ? new Date(token.inAppSentAt).toISOString() : null,
      };
    }),
  });
});

app.get('/api/admin/signup-requests/:requestId/payment-proof', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId).lean();
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  const streamed = streamPaymentProofFromDataUrl(
    res,
    request.paymentProof,
    `signup-proof-${String(request._id)}.dat`,
  );
  if (!streamed) {
    res.status(404).json({ error: 'Payment proof is not available for this signup request.' });
  }
});

app.post('/api/admin/signup-requests/:requestId/approve', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending requests can be approved.' });
    return;
  }

  const existingUser = await UserModel.findOne({ email: request.email }).lean();
  if (existingUser) {
    request.status = 'rejected';
    request.notes = 'Email already registered.';
    request.reviewedByAdminId = req.user._id;
    request.reviewedByEmail = req.user.email;
    request.reviewedAt = new Date();
    await request.save();
    res.status(409).json({ error: 'Email already registered. Request auto-rejected.' });
    return;
  }

  let code = '';
  for (let i = 0; i < 5; i += 1) {
    const candidate = generateSignupTokenCode();
    const exists = await SignupTokenModel.findOne({ code: candidate }).lean();
    if (!exists) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    res.status(500).json({ error: 'Could not generate unique signup token. Try again.' });
    return;
  }

  const expiresAt = new Date(Date.now() + SIGNUP_TOKEN_TTL_MINUTES * 60 * 1000);
  const tokenDoc = await SignupTokenModel.create({
    code,
    email: request.email,
    signupRequestId: request._id,
    status: 'active',
    expiresAt,
  });

  request.status = 'approved';
  request.signupTokenId = tokenDoc._id;
  request.notes = String(req.body?.notes || '').trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedByEmail = req.user.email;
  request.reviewedAt = new Date();
  await request.save();

  res.status(201).json({
    requestId: String(request._id),
    token: {
      code,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

app.post('/api/admin/signup-requests/:requestId/send-code', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'approved' || !request.signupTokenId) {
    res.status(400).json({ error: 'Approve and generate token before sending code.' });
    return;
  }

  const tokenDoc = await SignupTokenModel.findById(request.signupTokenId);
  if (!tokenDoc) {
    res.status(404).json({ error: 'Signup token not found for this request.' });
    return;
  }

  if (tokenDoc.status !== 'active') {
    res.status(400).json({ error: 'Only active tokens can be sent in-app.' });
    return;
  }

  if (new Date(tokenDoc.expiresAt).getTime() <= Date.now()) {
    tokenDoc.status = 'expired';
    await tokenDoc.save();
    res.status(400).json({ error: 'Token expired. Approve request again to generate a new code.' });
    return;
  }

  tokenDoc.inAppSentAt = new Date();
  tokenDoc.inAppSentByAdminId = req.user._id;
  await tokenDoc.save();

  res.json({
    ok: true,
    requestId: String(request._id),
    sentAt: tokenDoc.inAppSentAt ? new Date(tokenDoc.inAppSentAt).toISOString() : null,
  });
});

app.post('/api/admin/signup-requests/:requestId/reject', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending requests can be rejected.' });
    return;
  }

  request.status = 'rejected';
  request.notes = String(req.body?.notes || '').trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedByEmail = req.user.email;
  request.reviewedAt = new Date();
  await request.save();

  res.json({ ok: true, requestId: String(request._id) });
});

app.get('/api/admin/subscriptions/requests/:requestId/payment-proof', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId).lean();
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  const streamed = streamPaymentProofFromDataUrl(
    res,
    request.paymentProof,
    `premium-proof-${String(request._id)}.dat`,
  );
  if (!streamed) {
    res.status(404).json({ error: 'Payment proof is not available for this premium request.' });
  }
});

app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  const users = await UserModel.find({}, {
    email: 1,
    firstName: 1,
    lastName: 1,
    role: 1,
    createdAt: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    users: users.map((item) => ({
      id: String(item._id),
      email: item.email,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      mobileNumber: item.phone || '',
      role: item.role || 'student',
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    })),
  });
});

app.post('/api/admin/users/create', authMiddleware, requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const firstName = sanitizeHumanName(req.body?.firstName || '');
  const lastName = sanitizeHumanName(req.body?.lastName || '');
  const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber || '');
  const password = String(req.body?.password || '');
  const planId = String(req.body?.planId || '').trim();
  const activatePlan = Boolean(req.body?.activatePlan);

  if (!email || !password || !mobileNumber) {
    res.status(400).json({ error: 'Email, mobile number, and password are required.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  if (!isValidMobileNumber(mobileNumber)) {
    res.status(400).json({ error: 'Enter a valid mobile number.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const [existingByEmail, existingByMobile] = await Promise.all([
    UserModel.findOne({ email }).lean(),
    findUserByMobileNumber(mobileNumber),
  ]);

  if (existingByEmail || existingByMobile) {
    const matchedBy = existingByEmail && existingByMobile
      ? 'both'
      : existingByEmail
        ? 'email'
        : 'mobile';
    res.status(409).json({ error: `Account already exists for this ${getDuplicateAccountFieldLabel(matchedBy)}.` });
    return;
  }

  let subscription = {
    status: 'inactive',
    planId: '',
    billingCycle: '',
    startedAt: null,
    expiresAt: null,
    paymentReference: '',
    lastActivatedAt: null,
  };

  if (activatePlan) {
    const plan = resolveSubscriptionPlan(planId);
    if (!plan) {
      res.status(400).json({ error: 'Valid planId is required when activatePlan is enabled.' });
      return;
    }
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
    subscription = {
      status: 'active',
      planId: plan.id,
      billingCycle: plan.billingCycle,
      startedAt,
      expiresAt,
      paymentReference: `admin-created-${Date.now()}`,
      lastActivatedAt: startedAt,
    };
  }

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({
    email,
    passwordHash,
    firstName,
    lastName,
    phone: mobileNumber,
    role: 'student',
    subscription,
  });

  res.status(201).json({
    ok: true,
    user: {
      id: String(user._id),
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      mobileNumber: user.phone || '',
      subscription: {
        ...normalizeSubscription(user),
        isActive: isSubscriptionActive(normalizeSubscription(user)),
      },
    },
  });
});

app.post('/api/admin/subscriptions/assign', authMiddleware, requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const planId = String(req.body?.planId || '').trim();
  const status = String(req.body?.status || 'active').trim().toLowerCase();
  const paymentReference = sanitizePlainText(req.body?.paymentReference || `admin-${Date.now()}`, 120);

  if (!email || !planId) {
    res.status(400).json({ error: 'User email and planId are required.' });
    return;
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    res.status(404).json({ error: 'User not found for provided email.' });
    return;
  }

  const plan = resolveSubscriptionPlan(planId);
  if (!plan) {
    res.status(400).json({ error: 'Invalid planId provided.' });
    return;
  }

  if (!['active', 'inactive', 'expired', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'status must be active, inactive, expired, or cancelled.' });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
  user.subscription = {
    status,
    planId: plan.id,
    billingCycle: plan.billingCycle,
    startedAt,
    expiresAt,
    paymentReference,
    lastActivatedAt: startedAt,
  };
  await user.save();

  res.json({
    ok: true,
    userId: String(user._id),
    email: user.email,
    subscription: {
      ...normalizeSubscription(user),
      isActive: isSubscriptionActive(normalizeSubscription(user)),
      planName: plan.name,
      dailyAiLimit: plan.dailyAiLimit,
    },
  });
});

app.delete('/api/admin/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'User id is required.' });
    return;
  }

  if (String(req.user._id) === userId) {
    res.status(400).json({ error: 'You cannot delete your own admin account.' });
    return;
  }

  const user = await UserModel.findById(userId).lean();
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  await Promise.all([
    UserModel.findByIdAndDelete(userId),
    AttemptModel.deleteMany({ userId }),
    TestSessionModel.deleteMany({ userId }),
    AIUsageModel.deleteMany({ userId }),
  ]);

  res.json({ ok: true, removedUserId: userId });
});

app.get('/api/admin/mcq-bank/structure', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const filter = subject ? { subject } : {};

  const rows = await MCQModel.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          subject: '$subject',
          part: '$part',
          chapter: '$chapter',
          section: '$section',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.subject': 1, '_id.part': 1, '_id.chapter': 1, '_id.section': 1 } },
  ]);

  res.json({
    structure: rows.map((item) => ({
      subject: String(item._id?.subject || ''),
      part: String(item._id?.part || ''),
      chapter: String(item._id?.chapter || ''),
      section: String(item._id?.section || ''),
      count: Number(item.count || 0),
    })),
  });
});

app.get('/api/admin/mcqs', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const part = String(req.query.part || '').trim().toLowerCase();
  const chapter = String(req.query.chapter || '').trim();
  const section = String(req.query.section || '').trim();
  const topic = String(req.query.topic || '').trim();
  const difficulty = String(req.query.difficulty || '').trim();
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 200, maxLimit: 500 });

  const filter = {};
  if (subject) filter.subject = subject;
  if (part && isPartSelectionRequiredSubject(subject)) filter.part = part;
  if (chapter) {
    const expr = containsRegex(chapter, 100);
    if (expr) filter.chapter = expr;
  }
  if (section) {
    const expr = containsRegex(section, 100);
    if (expr) filter.section = expr;
  }
  if (topic) {
    const expr = containsRegex(topic, 100);
    if (expr) filter.topic = expr;
  }
  if (difficulty) filter.difficulty = difficulty;

  const mcqs = await MCQModel.find(filter)
    .select(MCQ_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({
    page,
    limit,
    mcqs: mcqs.map((item) => serializeMcq(item)),
  });
});

app.post('/api/admin/mcqs/bulk-delete', authMiddleware, requireAdmin, async (req, res) => {
  const mode = String(req.body?.mode || '').trim().toLowerCase();
  const subject = String(req.body?.subject || '').trim().toLowerCase();
  const part = String(req.body?.part || '').trim().toLowerCase();
  const chapter = String(req.body?.chapter || '').trim();
  const sectionOrTopic = String(req.body?.sectionOrTopic || '').trim();

  if (!['all', 'subject', 'chapter', 'section-topic'].includes(mode)) {
    res.status(400).json({ error: 'mode must be one of: all, subject, chapter, section-topic.' });
    return;
  }

  if (part && part !== 'part1' && part !== 'part2') {
    res.status(400).json({ error: 'part must be one of: part1, part2, or empty.' });
    return;
  }

  const filter = {};

  if (mode === 'subject') {
    if (!subject) {
      res.status(400).json({ error: 'subject is required for subject deletion.' });
      return;
    }
    filter.subject = subject;
    if (part) {
      filter.part = part;
    }
  }

  if (mode === 'chapter') {
    if (!subject || !chapter) {
      res.status(400).json({ error: 'subject and chapter are required for chapter deletion.' });
      return;
    }
    filter.subject = subject;
    if (part) {
      filter.part = part;
    }
    filter.chapter = { $regex: `^${chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  if (mode === 'section-topic') {
    if (!subject || !sectionOrTopic) {
      res.status(400).json({ error: 'subject and section/topic are required for section/topic deletion.' });
      return;
    }
    filter.subject = subject;
    if (part) {
      filter.part = part;
    }
    if (chapter) {
      filter.chapter = { $regex: `^${chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }

    const escapedSectionOrTopic = sectionOrTopic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { section: { $regex: `^${escapedSectionOrTopic}$`, $options: 'i' } },
      { topic: { $regex: `^${escapedSectionOrTopic}$`, $options: 'i' } },
    ];
  }

  const result = await MCQModel.deleteMany(filter);

  broadcastSyncEvent({ role: 'all', event: 'sync', data: { type: 'mcq.bank.changed', action: 'bulk-delete' } });

  res.json({
    ok: true,
    mode,
    removed: result.deletedCount || 0,
  });
});

app.delete('/api/admin/mcqs/purge-all', authMiddleware, requireAdmin, async (_req, res) => {
  const [mcqResult, sessionResult, attemptResult] = await Promise.all([
    MCQModel.deleteMany({}),
    TestSessionModel.deleteMany({}),
    AttemptModel.deleteMany({}),
  ]);

  broadcastSyncEvent({ role: 'all', event: 'sync', data: { type: 'mcq.bank.changed', action: 'purge-all' } });

  res.json({
    ok: true,
    removed: {
      mcqs: mcqResult.deletedCount || 0,
      sessions: sessionResult.deletedCount || 0,
      attempts: attemptResult.deletedCount || 0,
    },
  });
});

async function parseMcqsFromSourceText(sourceText) {
  const text = String(sourceText || '').trim();
  if (!text) {
    return { parsed: [], errors: ['No readable content found to parse.'] };
  }

  const aiResult = await withRetries(async () => {
    const result = await parseBulkMcqsWithAi(text);
    if (!Array.isArray(result?.parsed) || result.parsed.length === 0) {
      throw new Error(result?.errors?.[0] || 'No MCQs were extracted from this document.');
    }
    return result;
  }, AI_PARSE_MAX_RETRIES, AI_PARSE_RETRY_BASE_DELAY_MS);

  const parsed = Array.isArray(aiResult.parsed) ? aiResult.parsed.slice(0, BULK_PARSE_LIMIT) : [];
  const errors = Array.isArray(aiResult.errors) ? [...aiResult.errors] : [];
  if ((aiResult.parsed?.length || 0) > BULK_PARSE_LIMIT && !errors.some((item) => /first 15 mcqs/i.test(String(item)))) {
    errors.unshift(`Only the first ${BULK_PARSE_LIMIT} MCQs were kept from this import.`);
  }

  if (!parsed.length) {
    return {
      parsed: [],
      errors: errors.length ? errors : ['No valid MCQs were extracted after retries.'],
    };
  }

  return { parsed, errors };
}

function normalizeMcqDedupText(value) {
  return flattenRichMcqTextForMatch(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTextTokenSet(value) {
  const normalized = normalizeMcqDedupText(value);
  if (!normalized) return new Set();
  return new Set(normalized.split(' ').filter((item) => item.length > 1));
}

function jaccardSimilarity(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set) || (!a.size && !b.size)) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function buildMcqSignature(question, options) {
  const normalizedQuestion = normalizeMcqDedupText(question);
  const normalizedOptions = (Array.isArray(options) ? options : [])
    .slice(0, 4)
    .map((item) => normalizeMcqDedupText(item));
  return `${normalizedQuestion}||${normalizedOptions.join('||')}`;
}

function buildMcqDuplicateFingerprint(row, index = 0) {
  const question = String(row?.question || '').trim();
  const options = (Array.isArray(row?.options) ? row.options : []).slice(0, 4).map((item) => String(item || '').trim());
  return {
    id: String(row?._id || row?.id || `ref-${index + 1}`),
    signature: buildMcqSignature(question, options),
    question,
    options,
    questionTokens: buildTextTokenSet(question),
    optionsTokens: buildTextTokenSet(options.join(' ')),
  };
}

function detectDuplicateGeneratedMcq(candidate, existingFingerprints) {
  const candidateFingerprint = buildMcqDuplicateFingerprint(candidate);
  if (!candidateFingerprint.signature) {
    return { duplicate: true, reason: 'Generated MCQ is empty after normalization.', similarity: 1, matchedId: '' };
  }

  for (const existing of existingFingerprints) {
    if (existing.signature && existing.signature === candidateFingerprint.signature) {
      return { duplicate: true, reason: `Duplicate of existing MCQ ${existing.id} (exact normalized match).`, similarity: 1, matchedId: existing.id };
    }

    const questionSimilarity = jaccardSimilarity(candidateFingerprint.questionTokens, existing.questionTokens);
    const optionsSimilarity = jaccardSimilarity(candidateFingerprint.optionsTokens, existing.optionsTokens);
    const combinedSimilarity = (questionSimilarity * 0.7) + (optionsSimilarity * 0.3);
    const highlySimilar = combinedSimilarity >= AI_SINGLE_MCQ_SIMILARITY_THRESHOLD
      || (questionSimilarity >= 0.92 && optionsSimilarity >= 0.7);

    if (highlySimilar) {
      return {
        duplicate: true,
        reason: `Too similar to existing MCQ ${existing.id} (similarity ${(combinedSimilarity * 100).toFixed(1)}%).`,
        similarity: combinedSimilarity,
        matchedId: existing.id,
      };
    }
  }

  return { duplicate: false, reason: '', similarity: 0, matchedId: '' };
}

function buildExistingMcqReferenceForPrompt(existingRows) {
  const lines = (Array.isArray(existingRows) ? existingRows : []).map((row, index) => {
    const question = normalizeRichMcqText(row?.question || '').slice(0, 260);
    const options = (Array.isArray(row?.options) ? row.options : [])
      .slice(0, 4)
      .map((item) => normalizeRichMcqText(item || '').slice(0, 160));
    return [
      `#${index + 1}`,
      `Q: ${question}`,
      `A: ${options[0] || ''}`,
      `B: ${options[1] || ''}`,
      `C: ${options[2] || ''}`,
      `D: ${options[3] || ''}`,
    ].join('\n');
  });

  const joined = lines.join('\n\n');
  return joined.length > AI_SINGLE_MCQ_REFERENCE_MAX_TEXT
    ? joined.slice(0, AI_SINGLE_MCQ_REFERENCE_MAX_TEXT)
    : joined;
}

async function fetchExistingMcqsForHierarchy(hierarchy) {
  const normalizedHierarchy = normalizeParsedHierarchyContext(hierarchy || {});
  const subject = normalizeSubjectKey(normalizedHierarchy.subject || '');
  if (!subject) return [];

  const filter = { subject };
  const isFlatTopicSubject = MCQ_FLAT_TOPIC_SUBJECTS.has(subject);
  const requiresPartSelection = !isFlatTopicSubject && isPartSelectionRequiredSubject(subject);

  if (requiresPartSelection && normalizedHierarchy.part) {
    filter.part = normalizedHierarchy.part;
  }

  if (!isFlatTopicSubject && normalizedHierarchy.chapter) {
    const escapedChapter = normalizedHierarchy.chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.chapter = { $regex: `^${escapedChapter}$`, $options: 'i' };
  }

  const sectionOrTopic = String(normalizedHierarchy.section || normalizedHierarchy.topic || '').trim();
  if (sectionOrTopic) {
    const escaped = sectionOrTopic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { section: { $regex: `^${escaped}$`, $options: 'i' } },
      { topic: { $regex: `^${escaped}$`, $options: 'i' } },
    ];
  }

  return MCQModel.find(filter)
    .select({ _id: 1, question: 1, options: 1 })
    .lean();
}

async function generateSingleMcqWithAi({
  sourceText,
  imageDataUrl,
  instructions,
  difficulty,
  hierarchy,
  existingMcqs = [],
}) {
  const openAiContext = await getOpenAiClientContext();
  const aiClient = openAiContext.client;
  const aiModel = String(openAiContext.model || AI_PARSE_DEFAULT_MODEL).trim() || AI_PARSE_DEFAULT_MODEL;

  if (!aiClient) {
    return { mcq: null, errors: ['OpenAI API is not configured for AI generation. Set OPENAI_API_KEY to continue.'] };
  }

  const requestedDifficulty = normalizeDifficulty(difficulty || 'Medium');
  const userInstructions = String(instructions || '').trim();
  const safeSourceText = String(sourceText || '').trim();
  const safeImageDataUrl = String(imageDataUrl || '').trim();

  if (!safeSourceText && !safeImageDataUrl) {
    return { mcq: null, errors: ['Provide source text or upload a document/image before generating MCQ.'] };
  }

  const baseHierarchy = normalizeParsedHierarchyContext(hierarchy || {});
  const existingRows = Array.isArray(existingMcqs) ? existingMcqs : [];
  const existingFingerprints = existingRows.map((row, index) => buildMcqDuplicateFingerprint(row, index));
  const existingReference = buildExistingMcqReferenceForPrompt(existingRows);
  const generatedSignatures = new Set();
  const regenerationErrors = [];

  for (let generationAttempt = 1; generationAttempt <= AI_SINGLE_MCQ_MAX_REGENERATIONS; generationAttempt += 1) {
    const rejectionHint = regenerationErrors.length
      ? `Previous attempt was rejected: ${regenerationErrors[regenerationErrors.length - 1]}`
      : '';

    const runCompletion = async () => {
      const userContent = [
        `Difficulty: ${requestedDifficulty}`,
        `Subject: ${baseHierarchy.subject || ''}`,
        `Part: ${baseHierarchy.part || ''}`,
        `Chapter: ${baseHierarchy.chapter || ''}`,
        `Section: ${baseHierarchy.section || ''}`,
        `Topic: ${baseHierarchy.topic || ''}`,
        userInstructions ? `Instructions: ${userInstructions}` : '',
        safeSourceText ? `Source:\n${safeSourceText.slice(0, AI_PARSE_MAX_INPUT_CHARS)}` : '',
        existingReference ? `Existing MCQs (reference, do not duplicate):\n${existingReference}` : '',
        rejectionHint,
      ].filter(Boolean).join('\n\n');

      const messagePayload = safeImageDataUrl
        ? [
          {
            role: 'user',
            content: [
              { type: 'text', text: userContent || 'Generate one MCQ from this image.' },
              { type: 'image_url', image_url: { url: safeImageDataUrl } },
            ],
          },
        ]
        : [
          {
            role: 'user',
            content: userContent,
          },
        ];

      const completion = await aiClient.chat.completions.create({
        model: aiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are an MCQ generation engine. Return valid JSON only.',
              'Generate exactly ONE MCQ using this schema:',
              '{"mcq":{"question":"...","options":["A option","B option","C option","D option"],"correctAnswer":"A|B|C|D|option text","explanation":"...","difficulty":"Easy|Medium|Hard"},"errors":["..."]}',
              'Rules:',
              '- Return exactly 4 options in A-D order.',
              '- Ensure exactly one correct answer.',
              '- Keep output concise and educational.',
              '- The MCQ must be completely NEW and unique versus every Existing MCQ reference.',
              '- Do not match or closely resemble any provided Existing MCQ (stem, wording pattern, options, or concept framing).',
              '- Never add markdown code fences.',
            ].join('\n'),
          },
          ...messagePayload,
        ],
      });

      const raw = completion.choices?.[0]?.message?.content || '';
      const parsedJson = extractJsonObject(raw);
      const row = parsedJson?.mcq || null;
      const normalized = normalizeAiParsedRows(row ? [row] : [], baseHierarchy, 'ai-generate');
      const extraErrors = Array.isArray(parsedJson?.errors)
        ? parsedJson.errors.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

      if (!normalized.parsed.length) {
        throw new Error(normalized.errors[0] || extraErrors[0] || 'AI could not generate a valid MCQ.');
      }

      const first = normalized.parsed[0];
      return {
        mcq: {
          question: first.question,
          options: (first.options || []).slice(0, 4),
          answer: first.answer,
          explanation: first.tip || '',
          difficulty: normalizeDifficulty(first.difficulty || requestedDifficulty),
        },
        errors: [...normalized.errors, ...extraErrors],
      };
    };

    const generatedResult = await withRetries(runCompletion, 2, AI_PARSE_RETRY_BASE_DELAY_MS);
    const candidate = generatedResult?.mcq;
    if (!candidate) {
      regenerationErrors.push(`Attempt ${generationAttempt}: generated MCQ payload was empty.`);
      continue;
    }

    const signature = buildMcqSignature(candidate.question, candidate.options);
    if (generatedSignatures.has(signature)) {
      regenerationErrors.push(`Attempt ${generationAttempt}: AI repeated a previous generated MCQ.`);
      continue;
    }
    generatedSignatures.add(signature);

    const duplicateResult = detectDuplicateGeneratedMcq(candidate, existingFingerprints);
    if (duplicateResult.duplicate) {
      regenerationErrors.push(`Attempt ${generationAttempt}: ${duplicateResult.reason}`);
      continue;
    }

    return {
      mcq: candidate,
      errors: [...(generatedResult.errors || []), ...regenerationErrors],
    };
  }

  return {
    mcq: null,
    errors: regenerationErrors.length
      ? [`Could not generate a unique MCQ after ${AI_SINGLE_MCQ_MAX_REGENERATIONS} attempt(s).`, ...regenerationErrors]
      : ['Could not generate a unique MCQ.'],
  };
}

app.post('/api/ai/parse-mcqs', authMiddleware, requireAdmin, aiParseUpload.single('file'), async (req, res) => {
  try {
    const sourceType = String(req.body?.sourceType || 'file').trim().toLowerCase();
    let sourceText = '';

    if (sourceType === 'file') {
      const upload = req.file;
      if (!upload?.buffer?.length) {
        res.status(400).json({ parsed: [], errors: ['Upload a PDF, DOC, DOCX, or TXT file before running AI analysis.'] });
        return;
      }

      const filePayload = {
        name: String(upload.originalname || 'upload.bin').trim(),
        mimeType: String(upload.mimetype || 'application/octet-stream').toLowerCase().trim(),
        size: Number(upload.size || upload.buffer.length || 0),
        dataUrl: `data:${String(upload.mimetype || 'application/octet-stream').toLowerCase()};base64,${upload.buffer.toString('base64')}`,
      };

      sourceText = await extractTextFromUpload(filePayload);
    } else {
      sourceText = String(req.body?.rawText || '').trim();
    }

    const result = await parseMcqsFromSourceText(sourceText);
    res.json(result);
  } catch (error) {
    console.error('AI MCQ parse failed:', error);
    res.status(400).json({
      parsed: [],
      errors: [error instanceof Error ? error.message : 'Could not parse content via AI.'],
    });
  }
});

app.post('/api/admin/ai-generate-mcq', authMiddleware, requireAdmin, aiParseUpload.single('file'), async (req, res) => {
  try {
    const sourceType = String(req.body?.sourceType || '').trim().toLowerCase();
    const upload = req.file;
    const rawText = String(req.body?.rawText || '').trim();
    const instructions = String(req.body?.instructions || '').trim();
    const difficulty = String(req.body?.difficulty || 'Medium').trim();

    let sourceText = rawText;
    let imageDataUrl = '';

    if (sourceType === 'file') {
      if (!upload?.buffer?.length) {
        res.status(400).json({ mcq: null, errors: ['Upload a PDF, DOCX, TXT, JPG, or PNG file before generating MCQ.'] });
        return;
      }

      const mimeType = String(upload.mimetype || 'application/octet-stream').toLowerCase().trim();
      const filePayload = {
        name: String(upload.originalname || 'upload.bin').trim(),
        mimeType,
        size: Number(upload.size || upload.buffer.length || 0),
        dataUrl: `data:${mimeType};base64,${upload.buffer.toString('base64')}`,
      };

      const isImage = /^image\/(png|jpe?g)$/i.test(mimeType);
      if (isImage) {
        imageDataUrl = filePayload.dataUrl;
      } else {
        sourceText = await extractTextFromUpload(filePayload);
      }
    }

    if (!sourceText && !imageDataUrl) {
      res.status(400).json({ mcq: null, errors: ['Provide source text or upload a supported file.'] });
      return;
    }

    const hierarchyContext = {
      subject: String(req.body?.subject || '').trim().toLowerCase(),
      part: String(req.body?.part || '').trim().toLowerCase(),
      chapter: String(req.body?.chapter || '').trim(),
      section: String(req.body?.section || '').trim(),
      topic: String(req.body?.topic || '').trim(),
    };

    const existingMcqs = await fetchExistingMcqsForHierarchy(hierarchyContext);

    const result = await generateSingleMcqWithAi({
      sourceText,
      imageDataUrl,
      instructions,
      difficulty,
      hierarchy: hierarchyContext,
      existingMcqs,
    });

    if (!result?.mcq) {
      res.status(400).json({ mcq: null, errors: result?.errors?.length ? result.errors : ['AI could not generate MCQ.'] });
      return;
    }

    res.json({ mcq: result.mcq, errors: result.errors || [] });
  } catch (error) {
    console.error('AI single MCQ generation failed:', error);
    res.status(400).json({
      mcq: null,
      errors: [error instanceof Error ? error.message : 'Could not generate AI MCQ.'],
    });
  }
});

app.post('/api/admin/mcqs/parse', authMiddleware, requireAdmin, async (req, res) => {
  const sourceType = String(req.body?.sourceType || 'text').trim().toLowerCase();

  try {
    let sourceText = '';
    if (sourceType === 'file') {
      sourceText = await extractTextFromUpload(req.body?.file || {});
    } else {
      sourceText = String(req.body?.rawText || '').trim();
    }

    const result = await parseMcqsFromSourceText(sourceText);
    res.json(result);
  } catch (error) {
    console.error('Admin MCQ parse failed:', error);
    res.status(400).json({
      parsed: [],
      errors: [error instanceof Error ? error.message : 'Could not parse content.'],
    });
  }
});

function buildAdminMcqDocument(input = {}) {
  const {
    question,
    questionImageUrl = '',
    questionImage = null,
    options,
    optionMedia,
    answer,
    subject,
    part,
    chapter,
    section,
    topic,
    difficulty = 'Medium',
    tip = '',
    explanationText = '',
    explanationImage = null,
    shortTrickText = '',
    shortTrickImage = null,
  } = input || {};

  const normalizedSubject = String(subject || '').toLowerCase().trim();
  const normalizedSubjectKey = normalizeSubjectKey(normalizedSubject);
  const normalizedPart = String(part || '').toLowerCase().trim();
  const normalizedChapter = String(chapter || '').trim();
  const normalizedSection = String(section || '').trim();
  const normalizedTopic = String(topic || '').trim();
  const isFlatTopicSubject = MCQ_FLAT_TOPIC_SUBJECTS.has(normalizedSubjectKey);
  const requiresPartSelection = !isFlatTopicSubject && isPartSelectionRequiredSubject(normalizedSubjectKey);

  if (!answer || !normalizedSubject) {
    throw new Error('answer and subject are required.');
  }

  if (!isFlatTopicSubject && (!normalizedChapter || !normalizedSection || (requiresPartSelection && !normalizedPart))) {
    throw new Error(
      requiresPartSelection
        ? 'part, chapter, and section are required for this subject.'
        : 'chapter and section are required for this subject.',
    );
  }

  if (isFlatTopicSubject && !normalizedTopic && !normalizedSection) {
    throw new Error('topic is required for this subject.');
  }

  const normalizedQuestionImage = normalizeMcqImageFile(questionImage, 'Question image');
  const normalizedExplanationImage = normalizeMcqImageFile(explanationImage, 'Explanation image');
  const normalizedShortTrickImage = normalizeMcqImageFile(shortTrickImage, 'Short trick image');
  const normalized = sanitizeMcqOptionsWithMedia(options, optionMedia);
  const normalizedOptions = normalized.options;
  const normalizedOptionMedia = normalized.optionMedia;

  const normalizedQuestionText = normalizeRichMcqText(question || '');
  const hasQuestionImage = Boolean(normalizedQuestionImage) || Boolean(String(questionImageUrl || '').trim());
  if (!normalizedQuestionText && !hasQuestionImage) {
    throw new Error('Question text or question image is required.');
  }

  const resolvedTopic = isFlatTopicSubject
    ? (normalizedTopic || normalizedSection)
    : String(normalizedTopic || `${normalizedChapter} - ${normalizedSection}`).trim();
  const resolvedSection = isFlatTopicSubject ? (normalizedSection || resolvedTopic) : normalizedSection;
  const resolvedAnswerKey = resolveAnswerToOptionKey(answer, normalizedOptionMedia, normalizedOptions);

  if (!resolvedAnswerKey) {
    throw new Error('Correct answer must match one option (A/B/C/D, 1/2/3/4, or exact option text).');
  }

  const normalizedExplanationText = normalizeRichMcqText(explanationText || tip || '');

  return {
    question: normalizedQuestionText || 'Refer to attached image.',
    questionImageUrl: String(questionImageUrl || '').trim(),
    questionImage: normalizedQuestionImage,
    options: normalizedOptions,
    optionMedia: normalizedOptionMedia,
    answer: resolvedAnswerKey,
    subject: normalizedSubject,
    part: isFlatTopicSubject ? '' : (requiresPartSelection ? normalizedPart : ''),
    chapter: isFlatTopicSubject ? '' : normalizedChapter,
    section: resolvedSection,
    topic: resolvedTopic,
    difficulty: String(difficulty),
    tip: normalizedExplanationText,
    explanationText: normalizedExplanationText,
    explanationImage: normalizedExplanationImage,
    shortTrickText: normalizeRichMcqText(shortTrickText || ''),
    shortTrickImage: normalizedShortTrickImage,
    source: 'Admin',
  };
}

app.post('/api/admin/mcqs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const mcqDocument = buildAdminMcqDocument(req.body || {});
    const mcq = await MCQModel.create(mcqDocument);

    broadcastSyncEvent({ role: 'all', event: 'sync', data: { type: 'mcq.bank.changed', action: 'create' } });

    res.status(201).json({
      mcq: serializeMcq(mcq),
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save MCQ.' });
  }
});

app.post('/api/admin/upload-mcqs-bulk', authMiddleware, requireAdmin, async (req, res) => {
  const requestBody = req.body || {};
  const incomingMcqs = Array.isArray(requestBody.mcqs) ? requestBody.mcqs : [];

  if (!incomingMcqs.length) {
    res.status(400).json({ success: false, createdCount: 0, failedCount: 0, errors: ['No MCQs provided for bulk upload.'] });
    return;
  }

  const scope = {
    subject: String(requestBody.subject || '').trim(),
    part: String(requestBody.part || '').trim(),
    chapter: String(requestBody.chapter || '').trim(),
    section: String(requestBody.section || '').trim(),
    topic: String(requestBody.topic || '').trim(),
  };

  const created = [];
  const errors = [];

  const candidates = incomingMcqs.slice(0, BULK_PARSE_LIMIT);
  if (incomingMcqs.length > BULK_PARSE_LIMIT) {
    errors.push(`Only the first ${BULK_PARSE_LIMIT} MCQs were processed.`);
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    const payload = {
      ...(item && typeof item === 'object' ? item : {}),
      subject: scope.subject || item?.subject,
      part: scope.part || item?.part,
      chapter: scope.chapter || item?.chapter,
      section: scope.section || item?.section,
      topic: scope.topic || item?.topic || scope.section || item?.section,
    };

    try {
      const mcqDocument = buildAdminMcqDocument(payload);
      const mcq = await MCQModel.create(mcqDocument);
      created.push(serializeMcq(mcq));
    } catch (error) {
      errors.push(`MCQ #${index + 1}: ${error instanceof Error ? error.message : 'Could not save.'}`);
    }
  }

  if (created.length > 0) {
    broadcastSyncEvent({ role: 'all', event: 'sync', data: { type: 'mcq.bank.changed', action: 'bulk-create' } });
  }

  res.status(created.length ? 201 : 400).json({
    success: created.length > 0,
    createdCount: created.length,
    failedCount: candidates.length - created.length,
    errors,
    mcqs: created,
  });
});

app.put('/api/admin/mcqs/:mcqId', authMiddleware, requireAdmin, async (req, res) => {
  const payload = {};
  ['question', 'questionImageUrl', 'answer', 'subject', 'part', 'chapter', 'section', 'topic', 'difficulty', 'tip', 'explanationText', 'shortTrickText'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const value = String(req.body[field] ?? '');
      payload[field] = ['subject', 'part'].includes(field)
        ? value.toLowerCase().trim()
        : ['question', 'tip', 'explanationText', 'shortTrickText'].includes(field)
          ? normalizeRichMcqText(value)
          : value;
    }
  });

  try {
    if (Object.prototype.hasOwnProperty.call(req.body, 'questionImage')) {
      payload.questionImage = normalizeMcqImageFile(req.body.questionImage, 'Question image');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'explanationImage')) {
      payload.explanationImage = normalizeMcqImageFile(req.body.explanationImage, 'Explanation image');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'shortTrickImage')) {
      payload.shortTrickImage = normalizeMcqImageFile(req.body.shortTrickImage, 'Short trick image');
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid image payload.' });
    return;
  }

  if (Array.isArray(req.body?.options)) {
    try {
      const normalized = sanitizeMcqOptionsWithMedia(req.body.options, req.body.optionMedia);
      payload.options = normalized.options;
      payload.optionMedia = normalized.optionMedia;
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid options payload.' });
      return;
    }
  } else if (Array.isArray(req.body?.optionMedia)) {
    try {
      const existing = await MCQModel.findById(req.params.mcqId).lean();
      if (!existing) {
        res.status(404).json({ error: 'MCQ not found.' });
        return;
      }
      const normalized = sanitizeMcqOptionsWithMedia(existing.options || [], req.body.optionMedia);
      payload.options = normalized.options;
      payload.optionMedia = normalized.optionMedia;
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid options payload.' });
      return;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'answer')) {
    const existingForAnswer = await MCQModel.findById(req.params.mcqId).lean();
    if (!existingForAnswer) {
      res.status(404).json({ error: 'MCQ not found.' });
      return;
    }

    const answerKey = resolveAnswerToOptionKey(
      payload.answer,
      payload.optionMedia || existingForAnswer.optionMedia || [],
      payload.options || existingForAnswer.options || [],
    );

    if (!answerKey) {
      res.status(400).json({ error: 'Correct answer must match one option (A/B/C/D, 1/2/3/4, or exact option text).' });
      return;
    }

    payload.answer = answerKey;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'explanationText') || Object.prototype.hasOwnProperty.call(payload, 'tip')) {
    const explanation = normalizeRichMcqText(payload.explanationText || payload.tip || '');
    payload.explanationText = explanation;
    payload.tip = explanation;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'question')) {
    const existingForQuestion = await MCQModel.findById(req.params.mcqId).lean();
    if (!existingForQuestion) {
      res.status(404).json({ error: 'MCQ not found.' });
      return;
    }

    const nextQuestion = normalizeRichMcqText(payload.question || '');
    const nextQuestionImage = payload.questionImage || existingForQuestion.questionImage || null;
    const nextLegacyImageUrl = String(payload.questionImageUrl || existingForQuestion.questionImageUrl || '').trim();
    if (!nextQuestion && !nextQuestionImage && !nextLegacyImageUrl) {
      res.status(400).json({ error: 'Question text or question image is required.' });
      return;
    }

    payload.question = nextQuestion || 'Refer to attached image.';
  }

  if (!payload.topic && (payload.chapter || payload.section)) {
    const chapterText = String(payload.chapter || '').trim();
    const sectionText = String(payload.section || '').trim();
    payload.topic = `${chapterText} - ${sectionText}`.trim();
  }

  const mcq = await MCQModel.findByIdAndUpdate(req.params.mcqId, { $set: payload }, { new: true });
  if (!mcq) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  broadcastSyncEvent({ role: 'all', event: 'sync', data: { type: 'mcq.bank.changed', action: 'update' } });

  res.json({
    mcq: serializeMcq(mcq),
  });
});

app.delete('/api/admin/mcqs/:mcqId', authMiddleware, requireAdmin, async (req, res) => {
  const mcqId = String(req.params.mcqId || '').trim();
  if (!mcqId) {
    res.status(400).json({ error: 'MCQ id is required.' });
    return;
  }

  const removed = await MCQModel.findByIdAndDelete(mcqId).lean();
  if (!removed) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  broadcastSyncEvent({ role: 'all', event: 'sync', data: { type: 'mcq.bank.changed', action: 'delete' } });

  res.json({ ok: true, removedMcqId: mcqId });
});

app.get('/api/admin/practice-board/questions', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const difficulty = String(req.query.difficulty || '').trim();
  const search = String(req.query.search || '').trim();
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 200, maxLimit: 500 });

  const filter = {};
  if (subject) filter.subject = subject;
  if (difficulty) filter.difficulty = difficulty;
  if (search) {
    const expr = containsRegex(search, 120);
    filter.$or = [
      { questionText: expr },
      { solutionText: expr },
    ];
  }

  const questions = await PracticeBoardQuestionModel.find(filter)
    .select(PRACTICE_BOARD_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({ page, limit, questions: questions.map((item) => serializePracticeBoardQuestion(item)) });
});

app.post('/api/admin/practice-board/questions', authMiddleware, requireAdmin, async (req, res) => {
  const {
    subject,
    difficulty = 'Medium',
    questionText = '',
    questionFile = null,
    solutionText = '',
    solutionFile = null,
  } = req.body || {};

  const normalizedSubject = String(subject || '').trim().toLowerCase();
  if (!normalizedSubject) {
    res.status(400).json({ error: 'subject is required.' });
    return;
  }

  let normalizedQuestionFile;
  let normalizedSolutionFile;
  try {
    normalizedQuestionFile = normalizePracticeBoardFile(questionFile);
    normalizedSolutionFile = normalizePracticeBoardFile(solutionFile);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid uploaded file.' });
    return;
  }

  if (!String(questionText || '').trim() && !normalizedQuestionFile) {
    res.status(400).json({ error: 'Provide question text or a question file.' });
    return;
  }

  if (!String(solutionText || '').trim() && !normalizedSolutionFile) {
    res.status(400).json({ error: 'Provide solution text or a solution file.' });
    return;
  }

  const created = await PracticeBoardQuestionModel.create({
    subject: normalizedSubject,
    difficulty: String(difficulty || 'Medium').trim() || 'Medium',
    questionText: String(questionText || '').trim(),
    questionFile: normalizedQuestionFile,
    solutionText: String(solutionText || '').trim(),
    solutionFile: normalizedSolutionFile,
    source: 'Admin',
  });

  res.status(201).json({ question: serializePracticeBoardQuestion(created) });
});

app.put('/api/admin/practice-board/questions/:questionId', authMiddleware, requireAdmin, async (req, res) => {
  const existing = await PracticeBoardQuestionModel.findById(req.params.questionId);
  if (!existing) {
    res.status(404).json({ error: 'Practice board question not found.' });
    return;
  }

  const next = {
    subject: Object.prototype.hasOwnProperty.call(req.body, 'subject')
      ? String(req.body.subject ?? '').trim().toLowerCase()
      : String(existing.subject || '').trim().toLowerCase(),
    difficulty: Object.prototype.hasOwnProperty.call(req.body, 'difficulty')
      ? String(req.body.difficulty ?? '').trim()
      : String(existing.difficulty || '').trim(),
    questionText: Object.prototype.hasOwnProperty.call(req.body, 'questionText')
      ? String(req.body.questionText ?? '').trim()
      : String(existing.questionText || '').trim(),
    solutionText: Object.prototype.hasOwnProperty.call(req.body, 'solutionText')
      ? String(req.body.solutionText ?? '').trim()
      : String(existing.solutionText || '').trim(),
  };

  let nextQuestionFile = existing.questionFile || null;
  let nextSolutionFile = existing.solutionFile || null;
  try {
    if (Object.prototype.hasOwnProperty.call(req.body, 'questionFile')) {
      nextQuestionFile = normalizePracticeBoardFile(req.body.questionFile);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'solutionFile')) {
      nextSolutionFile = normalizePracticeBoardFile(req.body.solutionFile);
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid uploaded file.' });
    return;
  }

  next.questionFile = nextQuestionFile;
  next.solutionFile = nextSolutionFile;

  if (!next.subject) {
    res.status(400).json({ error: 'subject is required.' });
    return;
  }

  if (!next.questionText && !next.questionFile) {
    res.status(400).json({ error: 'Provide question text or a question file.' });
    return;
  }

  if (!next.solutionText && !next.solutionFile) {
    res.status(400).json({ error: 'Provide solution text or a solution file.' });
    return;
  }

  Object.assign(existing, next);
  const updated = await existing.save();

  res.json({ question: serializePracticeBoardQuestion(updated) });
});

app.delete('/api/admin/practice-board/questions/:questionId', authMiddleware, requireAdmin, async (req, res) => {
  const questionId = String(req.params.questionId || '').trim();
  if (!questionId) {
    res.status(400).json({ error: 'Question id is required.' });
    return;
  }

  const removed = await PracticeBoardQuestionModel.findByIdAndDelete(questionId).lean();
  if (!removed) {
    res.status(404).json({ error: 'Practice board question not found.' });
    return;
  }

  res.json({ ok: true, removedQuestionId: questionId });
});

app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${String(req.method || 'GET').toUpperCase()} ${String(req.originalUrl || req.path || '').trim()}`,
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', {
    path: req.path,
    method: req.method,
    message: err?.message,
  });

  if (res.headersSent) {
    next(err);
    return;
  }

  if (String(err?.message || '').toLowerCase().includes('cors origin denied')) {
    res.status(403).json({
      error: 'CORS origin denied. Add your frontend origin to CORS_ALLOWED_ORIGINS or use a matching wildcard entry.',
    });
    return;
  }

  if (
    err?.code === 'LIMIT_FILE_SIZE'
    || err?.type === 'entity.too.large'
    || err?.status === 413
    || err?.statusCode === 413
  ) {
    const isAiParseRoute = String(req?.path || '').includes('/api/ai/parse-mcqs');
    res.status(413).json({
      error: isAiParseRoute
        ? `Uploaded file is too large. Upload PDF, DOC, DOCX, or TXT up to ${AI_PARSE_MAX_FILE_MB}MB.`
        : 'Uploaded file is too large. Upload a JPG, PNG, or PDF up to 5MB.',
    });
    return;
  }

  res.status(500).json({ error: 'Internal server error.' });
});

function validateCriticalConfiguration() {
  const problems = [];
  const warnings = [];

  if (IS_PRODUCTION && (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-me' || JWT_SECRET.length < 32)) {
    problems.push('JWT_SECRET must be set to a strong random value with at least 32 characters in production.');
  }

  if (IS_PRODUCTION && (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32)) {
    problems.push('JWT_REFRESH_SECRET must be set to a strong random value with at least 32 characters in production.');
  }

  if (IS_PRODUCTION && CORS_ALLOWED_ORIGINS.length === 0) {
    warnings.push('CORS_ALLOWED_ORIGINS is not configured in production. Falling back to allow-all CORS; configure this env var as soon as possible.');
  }

  if (problems.length) {
    throw new Error(`Security configuration validation failed: ${problems.join(' ')}`);
  }

  warnings.forEach((message) => console.warn(`Security warning: ${message}`));
}

function isMongoNetworkError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();

  if (name.includes('MongoNetworkTimeoutError') || name.includes('MongoServerSelectionError')) {
    return true;
  }

  return message.includes('timed out')
    && (message.includes('mongodb') || message.includes('mongo'));
}

process.on('unhandledRejection', (reason) => {
  if (isMongoNetworkError(reason)) {
    console.error('[mongo] Unhandled rejection due to transient network issue:', String(reason?.message || reason));
    return;
  }

  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  if (isMongoNetworkError(error)) {
    console.error('[mongo] Uncaught exception due to transient network issue:', error?.message || error);
    return;
  }

  console.error('Uncaught exception:', error);
  process.exit(1);
});

async function bootstrap() {
  validateCriticalConfiguration();
  const server = app.listen(PORT, () => {
    console.log(`NET360 API running on http://localhost:${PORT}`);
  });

  server.headersTimeout = clamp(REQUEST_TIMEOUT_MS + 5_000, 10_000, 180_000);
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = 15_000;

  // Run potentially slow external startup tasks after the server is listening
  // so deployment health checks are not blocked by Mongo/network latency.
  void (async () => {
    try {
      const openAiProbe = await runOpenAiConnectionProbe('startup');
      logOpenAiProbeStatus(openAiProbe);
    } catch (error) {
      console.error('[openai] Startup probe failed unexpectedly:', error?.message || error);
    }

    await connectMongo(MONGODB_URI);
    try {
      await bootstrapAdminAccounts();
    } catch (error) {
      console.error('[startup] Admin bootstrap deferred because MongoDB is unavailable:', error?.message || error);
    }

    await refreshNustAdmissionsCache({ force: true });
    setInterval(() => {
      void refreshNustAdmissionsCache({ force: true });
    }, NUST_ADMISSIONS_REFRESH_MS);
  })();
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error?.message || error);
  console.error('Startup error details:', {
    name: error?.name,
    code: error?.code,
  });

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('authentication failed')) {
    console.error('Hint: MongoDB credentials are invalid. Check DB username/password and URL-encoding of special password characters.');
  }
  if (message.includes('querysrv') || message.includes('enotfound') || message.includes('econnrefused')) {
    console.error('Hint: Atlas SRV/network resolution failed. Verify cluster hostname, Atlas network access (allowlist), and connection string format.');
  }
  if (message.includes('bad auth') || message.includes('not authorized')) {
    console.error('Hint: MongoDB user lacks required permissions. Ensure readWrite access on the target database.');
  }

  if (!MONGODB_URI) {
    console.error('Missing required env var: MONGODB_URI (or DATABASE_URL / MONGO_URI)');
  }
  process.exit(1);
});
